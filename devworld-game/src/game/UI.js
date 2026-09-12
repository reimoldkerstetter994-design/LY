export class UI {
  constructor() {
    this.commits = 0;
    this.blocks = 0;
    this.bugs = 0;
  }

  addCommit() {
    this.commits++;
    document.getElementById('stat-commits').textContent = this.commits;
  }

  addBlock() {
    this.blocks++;
    document.getElementById('stat-blocks').textContent = this.blocks;
  }

  addBug() {
    this.bugs++;
    document.getElementById('stat-bugs').textContent = this.bugs;
  }

  setActiveSlot(index) {
    document.querySelectorAll('.slot').forEach((el, i) => {
      el.classList.toggle('active', i === index);
    });
  }

  setQuest(text) {
    document.getElementById('quest-text').textContent = text;
  }

  showToast(message) {
    const toast = document.getElementById('message-toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }
}
