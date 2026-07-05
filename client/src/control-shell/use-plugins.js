import { useSyncExternalStore } from 'react';
import { api } from './api.js';

// Single source of plugin state for the whole UI. The plugin list is read by
// the settings tab, every PluginHost (panel/tab/background), and every
// PluginSlot; without a shared store each of those would fetch `/api/plugins`
// independently and re-fetch on every change. This external store fetches once,
// dedupes in-flight requests, and refreshes on the `wtp-plugins-changed` event.

let state = { plugins: [], loading: true, loaded: false };
let inFlight = null;
const listeners = new Set();

const emit = () => {
  for (const listener of listeners) listener();
};

export const refreshPlugins = () => {
  if (inFlight) return inFlight;
  if (!state.loading) {
    state = { ...state, loading: true };
    emit();
  }
  inFlight = api('/api/plugins')
    .then((res) => {
      state = { plugins: res.plugins || [], loading: false, loaded: true };
    })
    .catch(() => {
      state = { ...state, loading: false, loaded: true };
    })
    .finally(() => {
      inFlight = null;
      emit();
    });
  return inFlight;
};

export const notifyPluginsChanged = () => window.dispatchEvent(new CustomEvent('wtp-plugins-changed'));

if (typeof window !== 'undefined') {
  window.addEventListener('wtp-plugins-changed', () => {
    refreshPlugins();
  });
}

const subscribe = (callback) => {
  listeners.add(callback);
  if (!state.loaded && !inFlight) refreshPlugins();
  return () => listeners.delete(callback);
};

const getSnapshot = () => state;

// { plugins, loading, loaded }. `plugins` is a stable reference between changes.
export const usePlugins = () => useSyncExternalStore(subscribe, getSnapshot);
