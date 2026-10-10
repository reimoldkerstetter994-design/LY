# 寰宇 · 可观测宇宙模拟系统

**Huanyu — an interactive, physics-driven simulation of the observable universe.** ([English below](#english))

从地球表面一路缩放到 930 亿光年外的宇宙微波背景，跨越约 24 个数量级；从普朗克时期一路播放到热寂；并且可以亲手改变宇宙学参数，观察宇宙的历史、几何与命运如何随之改变。

所有内容都在浏览器中实时计算与渲染（Vite + React + TypeScript + Three.js），无需后端。

## 快速开始

需要 Node.js ≥ 20。

```bash
npm install
npm run dev        # 开发服务器 http://localhost:5173
npm run build      # 生产构建，输出到 dist/
npm run preview    # 预览生产构建
npm test           # 物理引擎单元测试（vitest）
npm run lint && npm run typecheck
```

建议使用开启硬件加速的桌面版 Chrome / Edge / Firefox / Safari。设置中可以切换粒子质量、辉光等以适配较弱的显卡。

## 五大模块

| 模块 | 内容 |
| --- | --- |
| **宇宙漫游** | 多尺度三维宇宙：程序化纹理的行星与卫星（按 JPL 轨道根数实时计算位置、按 IAU 自转轴取向）、土星环、小行星带、柯伊伯带、日球层顶、奥尔特云、旅行者号与新视野号；按视星等渲染的恒星与星云；银河系（棒、旋臂、尘埃带、HII 区）、仙女座 / 三角座 / 麦哲伦云等本星系群成员；以真实星系团为节点的本地宇宙网（室女座、后发座、巨引源、沙普利……）；按红移着色的宇宙网、类星体、红移壳层、哈勃球、事件视界、粒子视界，以及按功率谱合成的 CMB 球面。附带天体目录搜索、信息面板、“十的幂次”尺度条、模拟时钟与自动“宇宙之旅”。 |
| **宇宙演化** | 从 10⁻⁴⁴ 秒到 10¹⁰⁰ 年的对数时间轴：暴胀、粒子时期、核合成、复合（等离子体变透明）、黑暗时代、第一代恒星、再电离气泡、宇宙网的线性增长（Zel'dovich 近似）、暗能量时代与遥远未来；实时显示时间、红移、尺度因子、温度、哈勃参数、密度、视界与能量组分。 |
| **宇宙学实验室** | 调节 H₀、Ωm、Ωb、ΩΛ、w₀/wₐ、T_CMB、N_eff、nₛ、Aₛ、τ，或选择 Planck 2018、WMAP9、SH0ES、DESI 2025 动态暗能量、爱因斯坦—德西特、开放 / 闭合（大挤压）、幻影能量（大撕裂）、反弹宇宙等预设。10 类图表：膨胀历史、H(z)、能量组分、距离—红移、Davis–Lineweaver 时空图（固有 / 共动 / 共形三种坐标）、结构增长、物质功率谱、电离历史、温度史、恒星形成史；以及 18 项导出量和宇宙命运判定。 |
| **CMB 实验室** | 在 Web Worker 中由当前参数的温度功率谱抽取 aℓm，做球谐合成，得到摩尔威德投影的全天图；可换随机种子、分辨率（ℓ ≤ 1023）、多极矩带通、波束平滑与运动偶极，并对比模型 Dℓ、Planck 参考和该随机天空的实测 Dℓ（宇宙方差）。 |
| **宇宙学计算器** | 按红移、宇宙年龄、共动距离或回溯时间，给出光度 / 角直径 / 共动 / 光行距离、回溯时间、体积、当时的 H 与温度、退行速度等，并生成一段“光的故事”。 |

界面支持中文 / English 切换（默认跟随浏览器语言）。

## 物理模型与精度

物理引擎位于 `src/physics/`，有 32 个单元测试覆盖解析极限与观测值。

| 量 | 本模拟（Planck 2018 参数） | Planck 2018 |
| --- | --- | --- |
| 宇宙年龄 | 137.95 亿年 | 137.97 ± 0.23 亿年 |
| 物质—辐射相等 z_eq | 3419 | 3402 |
| 最后散射面 z* | 1090.7 | 1089.9 |
| 重子拖曳 z_drag / r_drag | 1060.8 / 146.8 Mpc | 1059.9 / 147.1 Mpc |
| 声学视界 r_s(z*) / 100θ* | 144.2 Mpc / 1.0398 | 144.4 Mpc / 1.0411 |
| 再电离中点 z_re（τ = 0.0544） | 7.69 | 7.67 |
| 粒子视界（可观测宇宙半径） | 461 亿光年 | ≈ 460 亿光年 |
| CMB 第 1–3 声学峰 ℓ | 226 / 521 / 818 | 220 / 537 / 811 |
| σ₈ | 0.83 | 0.81 |

- **背景宇宙学**：数值积分 Friedmann 方程（含辐射、物质、曲率与 CPL 暗能量），用带精确导数的 Hermite 插值表计算年龄与共形时间；在转折点 / 反弹点做 √ 奇点消去积分。可得到各种距离、视界、减速参数、线性增长因子与宇宙命运（热寂 / 大挤压 / 大撕裂 / 反弹）。
- **复合**：Peebles 三能级原子模型（RECFAST 修正因子 1.14），早期用 Saha 平衡，之后用隐式积分；再电离采用 CAMB 式 tanh 模型，并由光深 τ 反解中点红移。
- **CMB 功率谱**：半解析的紧耦合声学振荡模型——声学视界、重子负载、辐射驱动、多普勒项、可见度函数加权的 Silk 阻尼、早期 / 晚期 ISW、再电离抑制，用渐近 Bessel 投影核投影到多极矩，并以 Planck 2018 最佳拟合谱校准少数唯象常数。所有物理尺度都由参数实时计算，因此改变参数时谱的变化在物理上是正确的（例如闭合宇宙使峰向小 ℓ 移动，重子增多使奇数峰增高）。
- **CMB 天图**：高斯随机 aℓm + 环上归一化缔合勒让德递推（南北半球共享奇偶）+ FFT 的球谐合成，通过 Parseval 测试。
- **结构**：Eisenstein & Hu (1998) 无振荡转移函数的线性物质功率谱与 σ₈；Madau & Dickinson (2014) 恒星形成史；宇宙网采用 Voronoi 运动学模型（Icke & van de Weygaert），并用初始位置 + 增长因子演示结构形成。
- **太阳系**：JPL “Approximate Positions of the Planets”（Standish）轨道根数、天文年历低精度月球理论、IAU 自转轴；坐标系变换覆盖赤道 / 黄道 / 银道 / 超银道。
- **早期宇宙热史**：标准模型有效自由度 g*(T) 下的辐射时期 t–T 关系，并与 ΛCDM 表在 10⁴ 秒处连续衔接。

### 需要说明的近似

- 太阳系、恒星、星系、星系团与大尺度结构的位置使用真实数据；但银河系、仙女座等星系的细节形态、宇宙网的纤维与空洞是**统计意义上真实的程序化生成**，并非逐个星系的真实地图。
- CMB 功率谱是校准过的半解析模型，而不是完整的 Boltzmann 求解器（如 CAMB / CLASS）；CMB 天图是与模型统计一致的随机实现，不是 Planck 实测天图。
- 卫星（月球除外）采用圆轨道与近似相位。

## 操作

- 左键拖动：旋转 · 右键 / Shift + 拖动：平移 · 滚轮 / 双指捏合：缩放
- 单击标签：查看信息 · 双击标签或目录项：飞往
- 键盘：`+` / `−` 缩放 · 空格 播放 / 暂停模拟时间 · `Esc` 关闭面板
- 右侧尺度条一键跳转到任意尺度；底部“宇宙之旅”自动从地球飞到可观测宇宙边缘

## 目录结构

```
src/
  physics/      宇宙学、复合、CMB 谱与天图、功率谱、开普勒轨道、坐标系、时间线（含单元测试）
  data/         太阳系、恒星、星系、大尺度结构目录与尺度预设（中英双语）
  engine/       Three.js 引擎：分层多尺度渲染、对数缩放相机、标签、各尺度图层、演化场景、着色器
  sim/          星历、演化可视化状态、CMB Web Worker 客户端
  ui/           React 界面：漫游、演化、实验室、CMB、计算器、图表组件
  workers/      CMB 球谐合成 Worker
```

渲染上，每个尺度图层（天文单位、光年、千光年、百万光年、十亿光年）都在自身单位与自身相机中绘制，并按从大到小的顺序叠加，因此从行星表面到宇宙视界都不会损失浮点精度。

## 主要参考

Planck Collaboration (2018) VI · Hu & Sugiyama (1995, 1996) · Seager, Sasselov & Scott (RECFAST, 1999) · Eisenstein & Hu (1998) · Davis & Lineweaver (2004) · Madau & Dickinson (2014) · Caldwell, Kamionkowski & Weinberg (2003) · Adams & Laughlin (1997) · Tully et al. (2014, Laniakea) · Standish, JPL Solar System Dynamics · Icke & van de Weygaert (1987)

---

<a id="english"></a>

## English

Huanyu lets you zoom from Earth's surface to the cosmic microwave background ~46 billion light-years away (about 24 orders of magnitude), play cosmic history from the Planck era to heat death, and change the cosmological parameters to see how the universe's history, geometry and fate respond. Everything is computed and rendered in the browser.

**Run it:** `npm install && npm run dev`, then open http://localhost:5173. `npm test` runs the 32 physics tests; `npm run build` produces a static site in `dist/`.

**Modes**

- **Explore**: a multi-scale 3-D universe, from procedural planets with JPL ephemerides to the Milky Way, the Local Group, the nearby cosmic web (anchored on real clusters such as Virgo, Coma and the Great Attractor), a redshift-coloured web out to cosmic dawn, horizons and a CMB sphere synthesised from the power spectrum. Includes catalogue search, info cards, a powers-of-ten scale bar, a simulation clock and a guided tour.
- **Cosmic History**: a logarithmic timeline from 10⁻⁴⁴ s to 10¹⁰⁰ yr with structure formation, recombination, the first stars, reionization bubbles and the far future, plus live physical readouts.
- **Cosmology Lab**: sliders and presets (Planck, WMAP, SH0ES, DESI 2025, Einstein–de Sitter, open, closed/Big Crunch, phantom/Big Rip, bounce), ten chart types including a Davis–Lineweaver spacetime diagram, derived quantities and the fate of the universe.
- **CMB Lab**: full-sky Mollweide maps synthesised in a Web Worker, with seed, resolution, multipole band-pass, beam and dipole controls, compared against the model and the Planck reference.
- **Calculator**: distances, times and a plain-language "story of the light" for any redshift, age, distance or lookback time.

**Physics**: a numerical Friedmann solver, Peebles recombination, a semi-analytic CMB TT spectrum calibrated to Planck 2018, the Eisenstein–Hu matter power spectrum, JPL planetary elements and full sky-frame transforms. The table above compares key outputs with Planck 2018. Galaxy shapes and the cosmic web are procedural but statistically realistic; real catalogue objects are placed at their measured positions.
