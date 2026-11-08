// 本地预览服务器：双击“打开游戏.bat”就会跑起来并自动打开浏览器
// （游戏用了 ES Module，必须通过 http 打开，直接双击 index.html 是打不开的）
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const ROOT = __dirname;
const PORT = 8090;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log('奶蛙学走路已启动：');
  console.log('  电脑打开  http://localhost:' + PORT + '/');
  for (const list of Object.values(os.networkInterfaces())) {
    for (const it of list || []) {
      if (it.family === 'IPv4' && !it.internal) console.log('  手机打开  http://' + it.address + ':' + PORT + '/');
    }
  }
  console.log('关掉这个黑窗口就停止服务。');
  exec('start "" http://localhost:' + PORT + '/');
});
