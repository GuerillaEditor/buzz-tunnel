// Buzz relay pass-through reverse proxy.
// Listens on 127.0.0.1:28280 and forwards to the local relay at
// 127.0.0.1:28273, PRESERVING the original Host header. Tailscale Funnel on
// :10000 targets this port and sends Host "dukick-1.tailc0eb7b.ts.net:10000",
// which the relay now resolves to the (renamed) community, and which matches
// the NIP-42/NIP-98 URL remote clients sign. No Host rewrite — a rewrite would
// break NIP-98/NIP-42 auth (the signed `u`/`relay` tag must equal the dialed
// URL, and the relay derives expected host from the community's stored host).
const http = require('http');

const LISTEN_HOST = '127.0.0.1';
const LISTEN_PORT = 28280;
const TARGET_HOST = '127.0.0.1';
const TARGET_PORT = 28273;

const server = http.createServer((creq, cres) => {
  const preq = http.request(
    { host: TARGET_HOST, port: TARGET_PORT, method: creq.method, path: creq.url, headers: creq.headers },
    (pres) => { cres.writeHead(pres.statusCode, pres.headers); pres.pipe(cres); }
  );
  preq.on('error', () => { try { cres.writeHead(502); cres.end('proxy error'); } catch (_) {} });
  creq.pipe(preq);
});

server.on('upgrade', (creq, csock, chead) => {
  const preq = http.request(
    { host: TARGET_HOST, port: TARGET_PORT, method: creq.method, path: creq.url, headers: creq.headers }
  );
  preq.on('upgrade', (pres, psock, phead) => {
    let head = `HTTP/1.1 ${pres.statusCode} ${pres.statusMessage}\r\n`;
    for (let i = 0; i < pres.rawHeaders.length; i += 2) head += `${pres.rawHeaders[i]}: ${pres.rawHeaders[i + 1]}\r\n`;
    head += '\r\n';
    csock.write(head);
    if (phead && phead.length) psock.unshift(phead);
    if (chead && chead.length) psock.write(chead);
    psock.pipe(csock);
    csock.pipe(psock);
    const kill = () => { psock.destroy(); csock.destroy(); };
    psock.on('error', kill); csock.on('error', kill);
  });
  preq.on('error', () => csock.destroy());
  preq.end();
});

server.on('clientError', (err, sock) => { try { sock.destroy(); } catch (_) {} });

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`buzz pass-through proxy: ${LISTEN_HOST}:${LISTEN_PORT} -> ${TARGET_HOST}:${TARGET_PORT}`);
});
