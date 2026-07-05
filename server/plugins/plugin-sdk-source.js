// The plugin SDK, served at /plugin-sdk.js. A plugin surface (control panel or
// on-air overlay) includes it with <script src="/plugin-sdk.js"></script> and
// then uses the global `WTP`. It works the same whether the surface is embedded
// in the app or loaded standalone as an OBS/vMix browser source, because it
// only talks to the local server over relative URLs + a WebSocket.
//
// The plugin id is derived from the surface's own asset path
// (/plugin-assets/<source>/<slug>/...), so no configuration is needed.

export const PLUGIN_SDK_SOURCE = `(function () {
  var m = location.pathname.match(/\\/plugin-assets\\/([^/]+)\\/([^/]+)\\//);
  var pluginId = m ? m[1] + ':' + m[2] : null;
  var stateCbs = [], dataCbs = [];
  var lastState = null, lastData = {};
  var ws = null;

  function connect() {
    try {
      ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    } catch (e) { setTimeout(connect, 1000); return; }
    ws.onmessage = function (ev) {
      var msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.type === 'snapshot') {
        lastState = msg.payload;
        for (var i = 0; i < stateCbs.length; i++) stateCbs[i](lastState);
      } else if (msg.type === 'plugin-data' && msg.payload && msg.payload.pluginId === pluginId) {
        lastData = msg.payload.data || {};
        for (var j = 0; j < dataCbs.length; j++) dataCbs[j](lastData);
      }
    };
    ws.onclose = function () { setTimeout(connect, 1000); };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }
  connect();

  // WS only pushes on change; fetch the current data once on load.
  if (pluginId) {
    fetch('/api/plugins/' + encodeURIComponent(pluginId) + '/data')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        lastData = (j && j.data) || {};
        for (var k = 0; k < dataCbs.length; k++) dataCbs[k](lastData);
      })
      .catch(function () {});
  }

  window.WTP = {
    pluginId: pluginId,
    // Subscribe to the app state snapshot (fires immediately if already known).
    onState: function (cb) { stateCbs.push(cb); if (lastState) cb(lastState); },
    // Subscribe to this plugin's own content data (fires immediately).
    onData: function (cb) { dataCbs.push(cb); cb(lastData); },
    getState: function () { return lastState; },
    getData: function () { return lastData; },
    // Replace this plugin's content data; persists + broadcasts to all surfaces.
    setData: function (data) {
      lastData = data || {};
      return fetch('/api/plugins/' + encodeURIComponent(pluginId) + '/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: data }),
      }).then(function (r) { return r.json(); });
    },
    // Dispatch a canonical command (output:.../timer:.../global:...).
    command: function (actionId) {
      return fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId: actionId }),
      }).then(function (r) { return r.json(); });
    },
  };
})();
`;
