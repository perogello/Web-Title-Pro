(() => {
  const root = document.querySelector('.google-timer-2');
  const rawTimer = root?.querySelector('[data-timer="main"]');
  const visual = root?.querySelector('[data-google-timer-2-visual]');
  let observer = null;

  const normalizeDisplay = (value = '') => {
    const nextValue = String(value || '').trim().replace(/\.0$/, '');
    return nextValue || '00:00';
  };

  const createPart = (value) => {
    const node = document.createElement('span');
    node.className = 'google-timer-2__part';
    node.textContent = value;
    return node;
  };

  const createColon = () => {
    const node = document.createElement('span');
    node.className = 'google-timer-2__colon';
    node.setAttribute('aria-hidden', 'true');

    const topDot = document.createElement('span');
    topDot.className = 'google-timer-2__colon-dot google-timer-2__colon-dot--top';

    const bottomDot = document.createElement('span');
    bottomDot.className = 'google-timer-2__colon-dot google-timer-2__colon-dot--bottom';

    node.append(topDot, bottomDot);

    return node;
  };

  const renderTimer = () => {
    if (!rawTimer || !visual) {
      return;
    }

    const display = normalizeDisplay(rawTimer.textContent);
    const parts = display.split(':').filter(Boolean);

    visual.replaceChildren();
    parts.forEach((part, index) => {
      if (index > 0) {
        visual.appendChild(createColon());
      }
      visual.appendChild(createPart(part));
    });
    visual.setAttribute('aria-label', display);
  };

  window.WebTitleTemplate = {
    mount() {
      renderTimer();
      observer = new MutationObserver(renderTimer);
      if (rawTimer) {
        observer.observe(rawTimer, { childList: true, characterData: true, subtree: true });
      }
    },
    unmount() {
      observer?.disconnect();
      observer = null;
    },
  };
})();
