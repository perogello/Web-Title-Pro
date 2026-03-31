import { useEffect, useState } from 'react';
import { api, WS_ORIGIN } from './api.js';

export const useRealtimeState = () => {
  const [snapshot, setSnapshot] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [error, setError] = useState('');

  useEffect(() => {
    let socket;
    let reconnectTimer;
    let mounted = true;

    const loadInitial = async () => {
      try {
        const initial = await api('/api/state');
        if (mounted) {
          setSnapshot(initial);
          setError('');
        }
      } catch (requestError) {
        if (mounted) {
          setError(requestError.message);
        }
      }
    };

    const connect = () => {
      setConnection('connecting');
      socket = new WebSocket(`${WS_ORIGIN}/ws`);

      socket.addEventListener('open', () => {
        if (!mounted) return;
        setConnection('connected');
        setError('');
      });

      socket.addEventListener('message', (event) => {
        if (!mounted) return;
        const message = JSON.parse(event.data);
        if (message?.payload) {
          setSnapshot(message.payload);
        }
      });

      socket.addEventListener('close', () => {
        if (!mounted) return;
        setConnection('reconnecting');
        reconnectTimer = window.setTimeout(connect, 1200);
      });

      socket.addEventListener('error', () => {
        if (!mounted) return;
        setConnection('disconnected');
        setError('WebSocket connection failed');
      });
    };

    loadInitial();
    connect();

    return () => {
      mounted = false;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  return { snapshot, connection, error };
};

export const useSystemInfo = () => {
  const [systemInfo, setSystemInfo] = useState(null);

  useEffect(() => {
    let mounted = true;

    api('/api/system/info')
      .then((payload) => {
        if (mounted) {
          setSystemInfo(payload);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  return systemInfo;
};

export const useVmixState = () => {
  const [vmixState, setVmixState] = useState(null);

  useEffect(() => {
    let mounted = true;
    let timerId;

    const load = async () => {
      try {
        const nextState = await api('/api/vmix/status');

        if (mounted) {
          setVmixState(nextState);
        }
      } catch {}
    };

    load();
    timerId = window.setInterval(load, 1500);

    return () => {
      mounted = false;
      window.clearInterval(timerId);
    };
  }, []);

  return [vmixState, setVmixState];
};

export const useMidiState = () => {
  const [midiState, setMidiState] = useState(null);

  useEffect(() => {
    let mounted = true;
    let timerId;

    const load = async () => {
      try {
        const nextState = await api('/api/midi');

        if (mounted) {
          setMidiState(nextState);
        }
      } catch {}
    };

    load();
    timerId = window.setInterval(load, 4000);

    return () => {
      mounted = false;
      window.clearInterval(timerId);
    };
  }, []);

  return [midiState, setMidiState];
};
