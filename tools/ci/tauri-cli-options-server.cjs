const WebSocket = require('ws');

const options = {
  dev: false,
  features: null,
  // Force release build behavior to avoid dev server usage in CI iOS builds.
  args: ['--lib', '--release'],
  noise_level: 'Polite',
  vars: {},
  config: [],
  target_device: null,
};

const port = parseInt(process.env.TAURI_CLI_OPTIONS_PORT || '0', 10);
const server = new WebSocket.Server({ host: '127.0.0.1', port }, () => {
  const addr = server.address();
  const addrStr = addr.address + ':' + addr.port;
  console.log('CLI options WS server ' + addrStr);
});

server.on('connection', (ws) => {
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg && msg.method === 'options') {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id ?? 1, result: options }));
    }
  });
});

process.stdin.resume();
