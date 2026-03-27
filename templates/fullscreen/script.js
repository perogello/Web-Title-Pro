window.WebTitleTemplate = {
  mount(ctx) {
    this.root = ctx.stage.querySelector('.fs-root');
  },
  update(ctx) {
    if (!this.root) {
      return;
    }
    this.root.classList.remove('is-pulse');
    window.requestAnimationFrame(() => this.root?.classList.add('is-pulse'));
  },
  unmount() {
    this.root = null;
  },
};
