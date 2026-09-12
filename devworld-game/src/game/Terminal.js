const PUZZLES = [
  {
    prompt: '欢迎来到 DevWorld 终端!\n输入 commit 来提交你的第一个代码。',
    commands: {
      commit: () => ({
        output: '✓ Commit 成功! git commit -m "Hello DevWorld"\n\n新谜题: 输入 build 来编译项目。',
        next: 1,
        reward: 'commit',
      }),
    },
  },
  {
    prompt: '项目需要编译。输入 build 开始构建。',
    commands: {
      build: () => ({
        output: '✓ 构建成功! npm run build\n\n最后一步: 输入 deploy 部署到生产环境。',
        next: 2,
        reward: 'commit',
      }),
    },
  },
  {
    prompt: '一切就绪! 输入 deploy 完成部署。',
    commands: {
      deploy: () => ({
        output: '🚀 部署成功! 你的 DevWorld 已上线!\n\n所有终端谜题已完成。继续探索世界吧!',
        next: 3,
        reward: 'commit',
      }),
    },
  },
];

export class Terminal {
  constructor(ui, quests) {
    this.ui = ui;
    this.quests = quests;
    this.isOpen = false;
    this.puzzleIndex = 0;
    this.output = document.getElementById('terminal-output');
    this.input = document.getElementById('terminal-input');
    this.overlay = document.getElementById('terminal-overlay');

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleCommand();
    });
  }

  open() {
    this.isOpen = true;
    this.overlay.classList.remove('hidden');
    this.output.innerHTML = '';
    this.appendLine(PUZZLES[this.puzzleIndex].prompt);
    this.input.value = '';
    this.input.focus();
  }

  close() {
    this.isOpen = false;
    this.overlay.classList.add('hidden');
  }

  appendLine(text, className = '') {
    const line = document.createElement('div');
    line.textContent = text;
    if (className) line.className = className;
    this.output.appendChild(line);
    this.output.scrollTop = this.output.scrollHeight;
  }

  handleCommand() {
    const cmd = this.input.value.trim().toLowerCase();
    if (!cmd) return;

    this.appendLine(`> ${this.input.value}`);
    this.input.value = '';

    const puzzle = PUZZLES[this.puzzleIndex];
    const handler = puzzle.commands[cmd];

    if (handler) {
      const result = handler();
      this.appendLine(result.output);
      if (result.reward === 'commit') {
        this.ui.addCommit();
        this.quests.onCommit();
      }
      if (result.next !== undefined) {
        this.puzzleIndex = result.next;
        if (PUZZLES[this.puzzleIndex]) {
          setTimeout(() => {
            this.appendLine('\n' + PUZZLES[this.puzzleIndex].prompt);
          }, 500);
        }
      }
    } else {
      this.appendLine(`命令未找到: ${cmd}`);
      this.appendLine('可用命令: ' + Object.keys(puzzle.commands).join(', '));
    }
  }
}
