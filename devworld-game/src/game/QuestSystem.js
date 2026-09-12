const QUESTS = [
  {
    id: 'explore',
    text: '探索开发世界，找到终端并提交你的第一个 commit。',
    check: (s) => s.terminalUsed,
  },
  {
    id: 'commit',
    text: '在终端中完成 commit、build、deploy 三步操作。',
    check: (s) => s.commits >= 3,
  },
  {
    id: 'bugs',
    text: '收集散布在世界中的 3 个 Bug。',
    check: (s) => s.bugs >= 3,
  },
  {
    id: 'build',
    text: '在建造平台上放置 5 个方块。',
    check: (s) => s.blocksPlaced >= 5,
  },
  {
    id: 'complete',
    text: '🎉 所有任务完成! 你是真正的全栈开发者!',
    check: () => true,
  },
];

export class QuestSystem {
  constructor(ui) {
    this.ui = ui;
    this.state = {
      terminalUsed: false,
      commits: 0,
      bugs: 0,
      blocksPlaced: 0,
    };
    this.currentIndex = 0;
  }

  updateQuest() {
    while (
      this.currentIndex < QUESTS.length - 1 &&
      QUESTS[this.currentIndex].check(this.state)
    ) {
      this.currentIndex++;
      if (this.currentIndex < QUESTS.length) {
        this.ui.setQuest(QUESTS[this.currentIndex].text);
        this.ui.showToast('任务完成! ✓');
      }
    }
  }

  onTerminalUsed() {
    this.state.terminalUsed = true;
    this.updateQuest();
  }

  onCommit() {
    this.state.commits++;
    this.updateQuest();
  }

  onBugCollected() {
    this.state.bugs++;
    this.updateQuest();
  }

  onBlockPlaced() {
    this.state.blocksPlaced++;
    this.updateQuest();
  }
}
