const WebSocket = require('ws');

const options = {
  dev: false,
  // Ensure production protocol handler is compiled into mobile build.
  // #778：xcodebuild → tauri-cli xcode-script 路径的 cargo features 唯一来源是本 WS 服务
  // （CARGO_BUILD_FEATURES 非Cargo 变量、tauri.conf.json build.features 只影响 tauri build 路径），
  // 必须与 ios-testflight.yml 的裁剪边界保持一致：mobile-slim（裁刷课/自动化）+ bridge（保留 4399 桥）。
  features: ['custom-protocol', 'mobile-slim', 'bridge'],
  args: ['--lib', '--release', '--features', 'custom-protocol,mobile-slim,bridge'],
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
