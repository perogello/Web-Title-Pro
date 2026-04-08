const SELECTOR = '.lavka-lt';
const ENTER_DURATION = 1160;
const EXIT_DURATION = 420;
const MIN_PLATE_WIDTH = 300;
const RIGHT_PADDING = 20;
const LEFT_SAFE_PADDING = 72;
const RIGHT_GUTTER = 32;

const measureCanvas = document.createElement('canvas');
const measureContext = measureCanvas.getContext('2d');

let hideTimer = null;
let layoutFrame = null;
let layoutTimeout = null;

const clearTimers = () => {
  if (hideTimer) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (layoutFrame) {
    window.cancelAnimationFrame(layoutFrame);
    layoutFrame = null;
  }
  if (layoutTimeout) {
    window.clearTimeout(layoutTimeout);
    layoutTimeout = null;
  }
};

const getRoot = (context) => context?.stage?.querySelector(SELECTOR);

const forceReflow = (node) => {
  void node?.offsetWidth;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const measureTextWidth = (element) => {
  if (!element || !measureContext) {
    return 0;
  }

  const style = window.getComputedStyle(element);
  const fontSize = style.fontSize || '16px';
  const fontFamily = style.fontFamily || 'sans-serif';
  const fontStyle = style.fontStyle || 'normal';
  const fontVariant = style.fontVariant || 'normal';
  const font = `${fontStyle} ${fontVariant} 400 ${fontSize} ${fontFamily}`;
  measureContext.font = font;
  return Math.ceil(measureContext.measureText(element.textContent || '').width);
};

const syncLayout = (node) => {
  if (!node) {
    return;
  }

  const primary = node.querySelector('.lavka-lt__primary');
  const secondary = node.querySelector('.lavka-lt__secondary');
  const plate = node.querySelector('.lavka-lt__plate');
  if (!primary || !secondary || !plate) {
    return;
  }

  const viewportWidth =
    node.closest('.render-stage')?.clientWidth ||
    node.parentElement?.clientWidth ||
    window.innerWidth ||
    1280;

  const textWidth = Math.max(measureTextWidth(primary), measureTextWidth(secondary));
  const desiredWidth = Math.ceil(textWidth + LEFT_SAFE_PADDING + RIGHT_PADDING + 10);
  const rootLeft = parseFloat(window.getComputedStyle(node).left || '0') || 0;
  const plateOffset = parseFloat(window.getComputedStyle(plate).marginLeft || '0') || 0;
  const maxWidth = Math.max(MIN_PLATE_WIDTH, Math.floor(viewportWidth - rootLeft - plateOffset - RIGHT_GUTTER));
  const nextWidth = clamp(desiredWidth, MIN_PLATE_WIDTH, maxWidth);
  node.style.setProperty('--lavka-plate-width', `${nextWidth}px`);
};

const scheduleLayoutSync = (node) => {
  if (!node) {
    return;
  }

  syncLayout(node);

  layoutFrame = window.requestAnimationFrame(() => {
    syncLayout(node);
    layoutFrame = window.requestAnimationFrame(() => {
      syncLayout(node);
      layoutFrame = null;
    });
  });

  layoutTimeout = window.setTimeout(() => {
    syncLayout(node);
    layoutTimeout = null;
  }, 140);

  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      syncLayout(node);
    }).catch(() => {});
  }
};

const setImmediateState = (node, visible) => {
  if (!node) {
    return;
  }

  node.classList.remove('is-entering', 'is-exiting', 'is-visible', 'is-hidden');
  node.classList.add(visible ? 'is-visible' : 'is-hidden');
};

window.WebTitleTemplate = {
  mount(context) {
    const node = getRoot(context);
    scheduleLayoutSync(node);
    setImmediateState(node, Boolean(context?.program?.visible));
  },

  update(context) {
    const node = getRoot(context);
    if (!node) {
      return;
    }

    scheduleLayoutSync(node);

    if (!node.classList.contains('is-entering') && !node.classList.contains('is-exiting')) {
      setImmediateState(node, Boolean(context?.program?.visible));
    }
  },

  show(context) {
    const node = getRoot(context);
    if (!node) {
      return;
    }

    clearTimers();
    scheduleLayoutSync(node);
    node.classList.remove('is-hidden', 'is-exiting', 'is-visible');
    forceReflow(node);
    node.classList.add('is-entering');

    hideTimer = window.setTimeout(() => {
      node.classList.remove('is-entering');
      node.classList.add('is-visible');
      hideTimer = null;
    }, ENTER_DURATION);
  },

  hide(context) {
    const node = getRoot(context);
    if (!node) {
      return;
    }

    clearTimers();
    node.classList.remove('is-entering', 'is-hidden');
    node.classList.add('is-visible');
    forceReflow(node);
    node.classList.add('is-exiting');

    hideTimer = window.setTimeout(() => {
      node.classList.remove('is-exiting', 'is-visible');
      node.classList.add('is-hidden');
      hideTimer = null;
    }, EXIT_DURATION);
  },

  unmount() {
    clearTimers();
  },
};
