import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'web-title-pro.outputsSidebarWidth';
const MIN_WIDTH = 200;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 280;

const loadStored = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WIDTH;
    const num = Number(raw);
    if (!Number.isFinite(num)) return DEFAULT_WIDTH;
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, num));
  } catch {
    return DEFAULT_WIDTH;
  }
};

export function useResizableSidebar() {
  const [width, setWidth] = useState(loadStored);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ x: 0, w: width });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(width));
    } catch {}
  }, [width]);

  const beginDrag = useCallback((event) => {
    event.preventDefault();
    startRef.current = { x: event.clientX, w: width };
    setDragging(true);
  }, [width]);

  useEffect(() => {
    if (!dragging) return undefined;
    const onMove = (event) => {
      const delta = event.clientX - startRef.current.x;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startRef.current.w + delta));
      setWidth(next);
    };
    const onUp = () => setDragging(false);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging]);

  return { width, dragging, beginDrag };
}
