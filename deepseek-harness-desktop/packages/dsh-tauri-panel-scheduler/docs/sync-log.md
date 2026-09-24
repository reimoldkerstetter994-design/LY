# Scheduler 同步日志

用于记录 `source/dsh-automation` 能力同步到 `packages/dsh-tauri-panel-scheduler` 的进度，避免后续重复对比或遗漏实现。

## 同步基线

- 参考项目：[`MichengAI/dsh-automation`](https://github.com/MichengAI/dsh-automation)
- 本次对比版本：`v0.1.42`（`e75499e`，= 上游 `origin/main`，无更新提交）
- 已采纳基线：`f1bc91a`（`v0.1.32`）；宿主兼容跟进 `c426c3d`（`v0.1.35`，2026-09-10，适配 DSH `0.1.5-rc.1`）
- Panel 当前版本：`0.6.7`
- 记录更新时间：2026-09-16

## 宿主兼容修复（DSH 0.1.5-rc.1）

### 现象

内核升级到 `0.1.5-rc.1` 后，面板的「立即执行」与「定时触发」全部失败：`$DSH_HOME/crons/runs`
中的运行记录错误恒为 `cannot get property "agent" without inject`。

### 根因

- `0.1.2-rc.1` 的 `@deepseek-ai/dsh-agent/lib/types/index.js` 注册了 DX accessor
  `ctx.accessor('agent', { get: () => undefined })`；`0.1.5-rc.1` 移除了该注册。
- 于是读取 `agentCtx.agent` 不再得到 `undefined`，而是被 Cordis 上下文代理抛出
  `cannot get property "agent" without inject`（`@deepseek-ai/cordis/lib/index.js:675`）。
- `@deepseek-ai/dsh-agent-loop/lib/index.js` 同步改为把 Agent 作为 setup 的第二参数传入
  （`setup?.(prepared.agent.ctx, prepared.agent)`），`agents.enter(agent, parentAgent)` 也不再从 ctx 读 Agent。
- 旧实现 `const agent = agentCtx.agent` 在 setup 阶段即抛错，`executeTask` 整体失败；
  立即执行与定时触发共用该路径，故同时失效。

### 修复（对齐上游 `c426c3d` / `v0.1.35`）

- `src/host/service/executor.ts`：新增 `SetupAgentLike` 与 `resolveSetupAgent(agentCtx, createdAgent)`；
  setup 签名改为 `(agentCtx, createdAgent?)`，取值 `createdAgent ?? agentCtx.agent`——`??` 短路保证
  新宿主上绝不触碰会抛错的 `agentCtx.agent`，旧宿主仍走上下文入口。
- `src/types/dsh.d.ts`：移除 `Context.agent` 声明，避免再把 accessor 当作稳定 API。
- `src/host/service/executor.test.ts`：新增 3 例覆盖「第二参数优先」「旧宿主回落」「两者皆无 → undefined」，
  其中第一例用会抛错的 getter 模拟 `0.1.5-rc.1` 的 Cordis 代理行为。

### 已核对仍存在（0.1.5-rc.1）的宿主 API

`agents.create` 的 `setup` 首参、`agents.withoutInitiator`、`agentPresets.mount(agentCtx, id)`、
`installModelSelection`（`@deepseek-ai/dsh-agent`）、`sessions.flush(session)`、
`ctx.permissionPresets`——除 `ctx.agent` 外执行路径无其它 API 漂移。

### 与上游的其它差异（本插件不适用）

- `cordis.patch.yml` 的 `connection.inject: [webServer, webRuntime]`：上游用它恢复 Web RPC 启动；
  本插件路由直接注册在自身作用域的 `ctx.webServer`（`inject` 已声明 `webServer`），无需该补丁。
- `knownSessionIds` 的 `canListStored` 判定与 `{ header }` 兜底：本插件没有会话枚举关联逻辑。

## 已同步

### P0

- [x] 移除 scheduler executor 固定 `UNATTENDED_TOOL_ALLOWLIST`。
- [x] 不再禁止 `bash` / `pwsh` 的 `run_in_background`。
- [x] 无人值守执行只应用 Host permission preset，并调用 `setApprovalPolicy('never')`。
- [x] 保留执行超时、取消与取消收敛逻辑。
- [x] 支持 `once`、`hourly`、`daily`、`interval`、`workdays`、`weekly`、`monthly`、`custom`。
- [x] `interval` / `custom` 支持固定 `anchor`，下一次执行按 anchor + N × step 计算。
- [x] 恢复逻辑将进程中断的 `running` 记录标记为 `interrupted`；`queued` 不作为已开始执行处理。

### P1

- [x] 执行状态增加 `interrupted`，同步中英文显示。
- [x] 任务卡片菜单增加显式 `Edit`。
- [x] 任务计划描述支持单次、每小时、每月、自定义周期。
- [x] 每月计划支持日期 `1–31` 与时间。
- [x] 自定义计划支持间隔天数 `1–366` 与时间。
- [x] 一次性计划使用 `datetime-local`，并在计划行内填充剩余宽度。
- [x] 恢复原有工具栏布局，不增加时间筛选 Select。

### P2/P3

- [x] 页面从隐藏状态恢复可见时刷新。
- [x] 页面重新获得焦点时刷新。
- [x] 保留已有删除确认、workspace 校验、卡片点击编辑、超时取消与并发上限。

## 明确未同步

以下能力依赖桌面端当前没有提供的 Archive Manager 或 session-folder 能力，本轮不实施：

- Web 专用 session folders。
- whole-group archive。
- host sync bridge。
- Archive Manager UI。

## 验证记录

### 并发上限「等待中」提示（2026-09-16）

```text
pnpm run lint                                       # 0 error（17 条既有 warning）
pnpm --filter dsh-tauri-panel-scheduler typecheck   # tsc --noEmit 通过（0 error）
pnpm test -- --run                                  # 53 test files, 433 tests passed
pnpm --filter dsh-tauri-panel-scheduler build        # tsdown 通过，publint 无问题
git diff --check                                    # 无输出
```

新增单测 `src/host/utils/waiting.test.ts`（5 例：容量为 0、名额内不等待、在跑数占用名额、
运行中/暂停/未到点均不等待）。

### DSH 0.1.5-rc.1 宿主兼容修复（2026-09-13）

```text
pnpm run test -- --run                          # 43 test files, 338 tests passed
pnpm run typecheck                              # tsc --noEmit 通过（0 error）
pnpm --filter dsh-tauri-panel-scheduler build   # tsdown 构建通过，publint 无问题
pnpm exec eslint packages/dsh-tauri-panel-scheduler/src --fix
```

Lint 当前只有既有 warning（6 条既有 React 规则提示），无新增 error。

### v0.1.32 同步（2026-09-07）

```text
pnpm run test -- --run       # 17 test files, 106 tests passed
pnpm --filter dsh-tauri-panel-scheduler typecheck
pnpm --filter dsh-tauri-panel-scheduler build
pnpm exec eslint packages/dsh-tauri-panel-scheduler/src --fix
```

PR #412 的 Frontend、macOS、Ubuntu、Windows CI 均已通过。

## 内核侧交叉验证（0.1.5-rc.1）

内核自身消费方已经全部改用 setup 第二参数，可作为新 API 的权威样例：

- `@deepseek-ai/dsh-api-session-controller/lib/index.js:356-366`：
  `setup: async (agentCtx, agent) => { this.installSelection(agent); await presets.mount(agentCtx, resolvedId) }`。
- `@deepseek-ai/dsh-acp/lib/index.js:717`：`setup: async (agentCtx, agent) => { …agent.session.requestHeader()… }`。
- `@deepseek-ai/dsh-agent-loop/lib/index.js:1856`：`setup?.(prepared.agent.ctx, prepared.agent)`。

结论：`agentCtx` 只用于挂载预设/安装模型选择，Agent 一律走第二参数；`ctx.agent` 不再是可依赖入口。

## 后续同步流程

1. 获取参考仓库最新 tag 与提交：记录版本号和 commit SHA。
2. 对照参考项目的 `CHANGELOG.md`，按 P0 → P1 → P2/P3 分类新增能力。
3. 先更新本文件的“同步基线”和“待同步”项，再修改 host/client 实现。
4. 同步协议时同时检查：
   - `src/shared/constants.ts`
   - `src/host/types/index.ts`
   - `src/client/types/scheduler.ts`
   - `src/host/service/schedule.ts`
   - `src/host/service/executor.ts`
   - `src/client/components/task-create-dialog.tsx`
   - `src/client/locales/index.ts`
5. 完成后运行 lint、typecheck、test、build，并在本文件补充验证结果。
6. 将已完成项从“待同步”移动到“已同步”，保留未实施项及原因。

## v0.1.33–v0.1.42 评估与裁决（2026-09-16）

评估范围：`f1bc91a`（`v0.1.32`）..`e75499e`（`v0.1.42`），共 23 个提交；上游 `origin/main` 已停在 `e75499e`。

### 裁决结论

- **A 并发能力簇**（`1f38c56` / `207d2cc` / `3a4be24` / `88e20ed`）：**不采纳、不照搬**。保留本插件
  `SCHEDULER_MAX_CONCURRENT_RUNS = 4` 的全局上限，不引入上游的 `maxConcurrentRuns` 持久化字段与按任务并发。
  另立一条本地行为要求：**超出并发上限而未拉起的任务应显示「等待中」**（已同意，待实施）。
- **B 设置与模型菜单**（`5afa5a0`）：**不采纳**。本地保留模型选项描述行与现有信息密度。
- **C 插件自更新**（`81058eb` / `0c14fad`）：**不采纳**。桌面端已有分发/更新链路，不引入上游经
  `ctx.webServer` 暴露的自更新路由与 `pnpm` 拉起逻辑。

### 不采纳明细

| 提交 | 版本 | 结论 | 原因 |
| --- | --- | --- | --- |
| `1f38c56` | v0.1.39 | 不采纳 | 删除全局并发上限；本地保留 `SCHEDULER_MAX_CONCURRENT_RUNS = 4`。 |
| `207d2cc` | v0.1.40 | 不采纳 | 按任务并发 + 1 分钟间隔；不引入 `maxConcurrentRuns`。宿主 interval 下限本就是 1（`src/host/utils/schedule.ts:26`），UI `task-create-dialog.tsx:75` 的 `INTERVAL_OPTIONS` 保持从 5 起。 |
| `3a4be24` | v0.1.40 | 不采纳 | 工具 schema 去掉 `minimum`；本地 `src/host/tools/create-task.ts` 本就没有 `minimum`，无对应改动。 |
| `88e20ed` | v0.1.40 | 不采纳 | RPC 边界正整数校验；随并发特性一并放弃。 |
| `f4acaa4` | v0.1.41 | 不采纳 | 上游 sidebar 页签包裹方案；本地用 `src/client/register/panel.tsx` 的 `definePanel` 独立面板 + `src/client/register/session-icons.ts` DOM 注入，无 native-tabs 注册表。 |
| `c42700e` | v0.1.42 | 不采纳 | 同上；其「卸载时校验所有权再删」原则可在本地自检，但不构成必须改动。 |
| `0156a06` | v0.1.36 | 不采纳 | 会话枚举失败时保活；本地无会话枚举与会话关联清理逻辑（`sessionPersistence` / `knownSessionIds` 零引用）。 |
| `25e4e1b` | — | 部分已满足 | 会话枚举加固与 `cordis.patch.yml` 的 `connection` 补丁不适用本地（本地 patch 仅 `insert` 自身）；`trigger` 标签本地已是 `'schedule' \| 'manual'`（`src/host/types/index.ts:64`、`src/client/apis/index.type.ts:20`）。 |
| `f05c477` / `d60a711` | v0.1.37 / v0.1.38 | 不采纳 | 无 `src/` 改动，仅上游自身 peer/dev 依赖版本串与 `minimumReleaseAgeExclude` 登记；本地 `pnpm-workspace.yaml:46-70` 的 `dsh` catalog 已锁 `0.1.5-rc.2`。 |
| `5afa5a0` | v0.1.35 | 不采纳 | 纯视觉（模型描述行、菜单 hint、shell 尺寸）；本地保留现状。 |
| `81058eb` / `0c14fad` | v0.1.33 | 不采纳 | 插件自更新流程；桌面端已有分发/更新链路，避免双更新源与新增 loopback HTTP 写操作面。 |

归档（纯文档 / CI / release chore，无价值）：`e75499e`、`a8d87bf`、`d4b0109`、`a9f522c`、`ad0f77f`、`028f006`、`817dfd3`、`a1c6b9a`、`babc1c9`。

### 评估范围说明

上一轮（2026-09-13）直接从 `f1bc91a` 跳到 `c426c3d`，漏评 `f1bc91a..c426c3d` 之间触及 `src/` 的三个提交：
`81058eb`、`0c14fad`、`5afa5a0`。本轮已补评并给出裁决（均不采纳）。

### 本轮增量实施（2026-09-16）

- **并发上限提示**：调度器因 `SCHEDULER_MAX_CONCURRENT_RUNS = 4` 已满而未拉起任务时，任务卡片显示「等待中」。
  实现方式（裁决 A）：主机侧派生只读字段 `waiting`，不落盘。
  - 新增 `src/host/utils/waiting.ts`：`isTaskDue()` 与 `selectWaitingTaskIds()`，与 `tick()` 共用同一「到点且未在跑」判定；
    本次名额（`4 - running.size`）之内的任务不计入等待集，避免每个到点任务都闪一次「等待中」。
  - `src/host/service/scheduler.ts`：`tick()` 复用 `isTaskDue`；新增服务方法 `waitingIds()`。
  - `src/host/routes/tasks/get.ts`：任务列表按 `waitingIds()` 标注 `waiting: true`。
  - `src/host/types/index.ts`、`src/client/types/index.ts`、`src/client/apis/index.type.ts`：补 `waiting?: boolean`。
  - `src/client/components/task-card.tsx` + `task-card.cssr.ts`：卡片元信息行渲染「等待中」徽标。
  - `src/client/locales/index.ts`：新增 `waiting`（`等待中` / `Waiting`）。
  - 未采纳上游 `maxConcurrentRuns`（按任务并发）与「取消全局上限」，本地 `SCHEDULER_MAX_CONCURRENT_RUNS = 4` 保持不变。

## 待同步项

无。`f1bc91a..e75499e` 的全部提交已评估并由用户逐条裁决（见上），本地行为要求「等待中」已实施。

