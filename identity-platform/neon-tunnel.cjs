// 本地 CONNECT 隧道：127.0.0.1:<listen> → 本机 HTTP 代理 → PostgreSQL/Neon <target>:5432
// 仅用于开发机网络受限时的手动诊断；目标主机与代理端口必须通过环境变量显式提供，仓库不固化生产基础设施地址。
const net = require('net');
const TARGET_HOST = String(process.env.NEON_TUNNEL_TARGET_HOST || '').trim();
const TARGET_PORT = Number(process.env.NEON_TUNNEL_TARGET_PORT || 5432);
const PROXY = {
  host: String(process.env.NEON_TUNNEL_PROXY_HOST || '127.0.0.1').trim(),
  port: Number(process.env.NEON_TUNNEL_PROXY_PORT || 3067),
};
const LISTEN_PORT = Number(process.env.NEON_TUNNEL_LISTEN_PORT || 5433);

if (!TARGET_HOST) {
  console.error('缺少 NEON_TUNNEL_TARGET_HOST；拒绝启动未指定目标的本地数据库隧道。');
  process.exit(2);
}
for (const [name, value] of [['NEON_TUNNEL_TARGET_PORT', TARGET_PORT], ['NEON_TUNNEL_PROXY_PORT', PROXY.port], ['NEON_TUNNEL_LISTEN_PORT', LISTEN_PORT]]) {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    console.error(`${name} 必须是 1-65535 的整数端口。`);
    process.exit(2);
  }
}

const server = net.createServer((client) => {
  const proxy = net.connect(PROXY.port, PROXY.host, () => {
    proxy.write(`CONNECT ${TARGET_HOST}:${TARGET_PORT} HTTP/1.1\r\nHost: ${TARGET_HOST}:${TARGET_PORT}\r\n\r\n`);
  });
  let connected = false;
  proxy.on('data', (d) => {
    if (!connected) {
      connected = true; // 吞掉 HTTP 响应头（CONNECT 200 后才是隧道数据）
      const idx = d.indexOf('\r\n\r\n');
      const head = d.slice(0, idx).toString();
      if (!/ 200 /.test(head)) { console.error('隧道失败:', head.split('\r\n')[0]); client.destroy(); proxy.destroy(); return; }
      if (idx + 4 < d.length) client.write(d.slice(idx + 4));
      return;
    }
    client.write(d);
  });
  client.on('data', (d) => proxy.write(d));
  client.on('error', () => proxy.destroy());
  proxy.on('error', (e) => { console.error('代理错误:', e.message); client.destroy(); });
  client.on('close', () => proxy.destroy());
  proxy.on('close', () => client.destroy());
});
server.listen(LISTEN_PORT, '127.0.0.1', () => console.log(`隧道就绪: 127.0.0.1:${LISTEN_PORT} → ${TARGET_HOST}:${TARGET_PORT} via ${PROXY.host}:${PROXY.port}`));
