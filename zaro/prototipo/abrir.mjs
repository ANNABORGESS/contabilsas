// Abre o protótipo do ZARO no navegador: serve esta pasta em http://localhost:5500.
// O ZARO.dc.html precisa ser aberto por um endereço http (não direto do arquivo) para carregar os uploads.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const raiz = path.dirname(fileURLToPath(import.meta.url));
const porta = Number(process.env.PORT || 5500);
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };

http
  .createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (rel === '/') rel = '/ZARO.dc.html';
    const arq = path.join(raiz, rel);
    if (!arq.startsWith(raiz) || !fs.existsSync(arq) || !fs.statSync(arq).isFile()) {
      res.writeHead(404);
      return res.end('não encontrado');
    }
    res.writeHead(200, { 'Content-Type': tipos[path.extname(arq).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(arq).pipe(res);
  })
  .listen(porta, '127.0.0.1', () => {
    const url = `http://localhost:${porta}/`;
    console.log(` ZARO aberto em ${url}  (deixe esta janela aberta)`);
    const abrir = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(abrir);
  });
