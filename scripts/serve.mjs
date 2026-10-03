import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const port = Number(process.env.PAIBAN_PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };
try { await stat(path.join(root, 'index.html')); }
catch { console.error('未找到试用版文件，请先在项目目录运行 npm run build。'); process.exit(1); }
const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
    const content = await readFile(filename);
    response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
      'Cache-Control': filename.includes(path.sep + 'assets' + path.sep) ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('找不到这个页面'); }
});
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') console.log(`端口 ${port} 已占用。如果牌伴已经启动，可打开 http://localhost:${port}/`);
  else console.error(error.message);
  process.exitCode = 1;
});
server.listen(port, '0.0.0.0', () => {
  const boundPort = server.address().port;
  console.log(`\n牌伴已启动，电脑访问：http://localhost:${boundPort}/`);
  for (const [name, addresses] of Object.entries(networkInterfaces())) for (const address of addresses || []) {
    if (address.family === 'IPv4' && !address.internal && !address.address.startsWith('169.254.')) console.log(`${name}：http://${address.address}:${boundPort}/`);
  }
  console.log('\n安卓手机连接同一个 Wi-Fi 后，使用 WLAN 地址。保持此窗口开启。\n局域网 HTTP 仅供预览；离线安装需要 HTTPS 或本机 localhost。\n按 Ctrl+C 停止。');
});
