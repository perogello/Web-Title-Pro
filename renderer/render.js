const stage = document.getElementById('render-stage');
const styleHost = document.getElementById('template-style-host');
const scriptHost = document.getElementById('template-script-host');
const connectionBadge = document.getElementById('renderer-connection');
const stateBadge = document.getElementById('renderer-state');
const templateBadge = document.getElementById('renderer-template');
const wsUrl = `${window.location.origin.replace(/^http/, 'ws')}/ws`;
const searchParams = new URLSearchParams(window.location.search);
const usePreviewState = searchParams.get('preview') === '1';
const isEmbedded = searchParams.get('embed') === '1';
const isPreview = usePreviewState;
const usePreviewLayout = usePreviewState || isEmbedded;
const requestedOutput = searchParams.get('output') || 'main';
const PREVIEW_BASE_WIDTH = 1920;
const PREVIEW_BASE_HEIGHT = 1080;

let currentTemplateId = '';
let currentTemplateApi = null;
let currentSnapshot = null;
let currentVisible = false;
let hideTimer = null;
const loadedSystemFonts = new Map();

const setConnection = (label) => {
  connectionBadge.textContent = label;
};

document.body.dataset.preview = isPreview ? '1' : '0';
document.body.dataset.embed = isEmbedded ? '1' : '0';
document.body.dataset.previewLayout = usePreviewLayout ? '1' : '0';

const updatePreviewScale = () => {
  if (!usePreviewLayout) {
    return;
  }

  const inset = isEmbedded ? 0 : 36;
  const availableWidth = Math.max(window.innerWidth - inset, 320);
  const availableHeight = Math.max(window.innerHeight - inset, 180);
  const scale = Math.min(1, availableWidth / PREVIEW_BASE_WIDTH, availableHeight / PREVIEW_BASE_HEIGHT);
  document.documentElement.style.setProperty('--preview-scale', String(scale));
};

updatePreviewScale();
window.addEventListener('resize', updatePreviewScale);

const createContext = () => ({
  stage,
  snapshot: currentSnapshot,
  output: resolveOutput(currentSnapshot),
  program: resolveProgram(currentSnapshot),
  timers: currentSnapshot?.timers || [],
});

const resolveOutput = (snapshot) =>
  snapshot?.outputs?.find((output) => output.id === requestedOutput || output.key === requestedOutput) || null;

const resolveProgram = (snapshot) => {
  const matchedOutput = resolveOutput(snapshot);
  if (usePreviewState) {
    return matchedOutput?.previewProgram || matchedOutput?.program || snapshot?.previewProgram || snapshot?.program;
  }
  return matchedOutput?.program || snapshot?.program;
};

const loadScript = (src) =>
  new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    scriptHost.appendChild(script);
  });

const loadStyle = (href) =>
  new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = resolve;
    link.onerror = reject;
    styleHost.appendChild(link);
  });

const clearTemplateRuntime = () => {
  currentTemplateApi?.unmount?.(createContext());
  currentTemplateApi = null;
  window.WebTitleTemplate = undefined;
  styleHost.innerHTML = '';
  scriptHost.innerHTML = '';
};

const extractBodyMarkup = (htmlText) => {
  const doc = new DOMParser().parseFromString(htmlText, 'text/html');
  doc.querySelectorAll('link[rel="stylesheet"], script').forEach((node) => node.remove());
  return doc.body?.innerHTML || htmlText;
};

const ensureTemplate = async (template) => {
  if (!template) {
    stage.innerHTML = '';
    currentTemplateId = '';
    templateBadge.textContent = 'No template loaded';
    return;
  }

  if (currentTemplateId === template.id) {
    return;
  }

  clearTemplateRuntime();
  currentTemplateId = template.id;
  templateBadge.textContent = template.name;

  const htmlResponse = await fetch(template.assetUrls.html);
  const htmlText = await htmlResponse.text();

  await Promise.all((template.assetUrls.css || []).map((href) => loadStyle(href)));
  stage.innerHTML = extractBodyMarkup(htmlText);

  for (const src of template.assetUrls.js || []) {
    await loadScript(src);
  }

  currentTemplateApi = window.WebTitleTemplate || null;
  currentTemplateApi?.mount?.(createContext());
};

const applyFields = (fields = {}) => {
  stage.querySelectorAll('[data-field]').forEach((node) => {
    const key = node.getAttribute('data-field');
    const value = fields[key] ?? '';
    if (node.tagName === 'IMG') {
      node.src = value;
    } else {
      node.textContent = value;
    }
  });
};

const applyFieldStyles = (fieldStyles = {}) => {
  stage.querySelectorAll('[data-field]').forEach((node) => {
    const key = node.getAttribute('data-field');
    const style = fieldStyles?.[key] || {};

    node.style.fontFamily = ensureSystemFontFace(style, key);
    node.style.fontWeight = '';
    node.style.fontSize = style.fontSize ? `${style.fontSize}px` : '';
    node.style.color = style.color || '';
  });
};

const hashFontKey = (value = '') => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
};

const getFontFormat = (fontSourcePath = '') => {
  const lowerPath = String(fontSourcePath || '').toLowerCase();
  if (lowerPath.endsWith('.otf') || lowerPath.endsWith('.otc')) {
    return 'opentype';
  }
  return 'truetype';
};

const ensureSystemFontFace = (style = {}, fieldKey = '') => {
  const fontFamily = typeof style.fontFamily === 'string' ? style.fontFamily.trim() : '';
  const fontSourcePath = typeof style.fontSourcePath === 'string' ? style.fontSourcePath.trim() : '';

  if (!fontFamily) {
    return '';
  }

  if (!fontSourcePath) {
    return fontFamily;
  }

  const fontKey = `${fontFamily}::${fontSourcePath}`;
  let fontEntry = loadedSystemFonts.get(fontKey);
  if (!fontEntry) {
    const alias = `WTPFont_${fieldKey || 'field'}_${hashFontKey(fontKey)}`;
    const fontUrl = `/api/system-font-file?path=${encodeURIComponent(fontSourcePath)}`;
    const format = getFontFormat(fontSourcePath);
    const fontFace = new FontFace(alias, `url("${fontUrl}") format("${format}")`, {
      style: 'normal',
      weight: '100 900',
      display: 'swap',
    });

    fontEntry = {
      alias,
      loadPromise: fontFace
        .load()
        .then((loadedFace) => {
          document.fonts.add(loadedFace);
          return loadedFace;
        })
        .catch(() => null),
    };
    loadedSystemFonts.set(fontKey, fontEntry);
  }

  return `"${fontEntry.alias}"`;
};

const resolveTimerForSlot = (template, output, timers, slotId) => {
  const eligibleTimers = (timers || []).filter((timer) => timer.sourceType !== 'vmix');
  const slotMatches = eligibleTimers.filter((timer) => (timer.targetTimerId || timer.id) === slotId);
  const exactTemplateMatches = slotMatches.filter((timer) => timer.targetTemplateId === template?.id);
  const genericTemplateMatches = slotMatches.filter((timer) => !timer.targetTemplateId);
  const exactOutputMatches = exactTemplateMatches.filter((timer) => timer.targetOutputId === output?.id);
  const templateOnlyMatches = exactTemplateMatches.filter((timer) => !timer.targetOutputId);
  const genericOutputMatches = genericTemplateMatches.filter((timer) => timer.targetOutputId === output?.id);
  const genericMatches = genericTemplateMatches.filter((timer) => !timer.targetOutputId);

  return (
    exactOutputMatches.find((timer) => timer.running) ||
    exactOutputMatches[0] ||
    templateOnlyMatches.find((timer) => timer.running) ||
    templateOnlyMatches[0] ||
    genericOutputMatches.find((timer) => timer.running) ||
    genericOutputMatches[0] ||
    genericMatches.find((timer) => timer.running) ||
    genericMatches[0] ||
    null
  );
};

const applyTimers = (template, output, timers = []) => {
  stage.querySelectorAll('[data-timer]').forEach((node) => {
    const timer = resolveTimerForSlot(template, output, timers, node.getAttribute('data-timer'));
    node.textContent = timer?.display || '00:00.0';
  });
};

const getOutroDuration = () => {
  const timingNode = stage.querySelector('[data-outro-ms]');
  return Number(timingNode?.getAttribute('data-outro-ms') || 450);
};

const applyVisibility = (visible) => {
  clearTimeout(hideTimer);
  currentVisible = visible;
  document.body.dataset.air = visible ? 'on' : 'off';
  stateBadge.textContent = visible ? 'ON AIR' : 'STANDBY';

  if (visible) {
    stage.classList.remove('is-hidden', 'is-hiding');
    stage.classList.add('is-visible');
    currentTemplateApi?.show?.(createContext());
    return;
  }

  if (!stage.classList.contains('is-visible') && !currentVisible) {
    stage.classList.remove('is-visible', 'is-hiding');
    stage.classList.add('is-hidden');
    return;
  }

  stage.classList.remove('is-visible');
  stage.classList.add('is-hiding');
  currentTemplateApi?.hide?.(createContext());
  hideTimer = window.setTimeout(() => {
    if (currentVisible) return;
    stage.classList.remove('is-hiding');
    stage.classList.add('is-hidden');
  }, getOutroDuration());
};

const applySnapshot = async (snapshot) => {
  currentSnapshot = snapshot;
  const output = resolveOutput(snapshot);
  const program = resolveProgram(snapshot);
  const template = snapshot.templates.find((item) => item.id === program?.templateId);
  await ensureTemplate(template);
  applyFields(program?.fields);
  applyFieldStyles(program?.fieldStyles);
  applyTimers(template, output, snapshot.timers);
  applyVisibility(program?.visible);
  currentTemplateApi?.update?.(createContext());
};

const fetchInitialState = async () => {
  const response = await fetch('/api/render/state');
  const snapshot = await response.json();
  await applySnapshot(snapshot);
};

const connect = () => {
  setConnection('CONNECTING');
  const socket = new WebSocket(wsUrl);

  socket.addEventListener('open', () => setConnection('CONNECTED'));
  socket.addEventListener('message', async (event) => {
    const message = JSON.parse(event.data);
    if (message?.payload) {
      await applySnapshot(message.payload);
    }
  });
  socket.addEventListener('close', () => {
    setConnection('RECONNECT');
    window.setTimeout(connect, 1200);
  });
  socket.addEventListener('error', () => setConnection('ERROR'));
};

fetchInitialState().catch(() => setConnection('BOOT FAIL'));
connect();
