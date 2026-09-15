// 极简静态服务：仅绑定 127.0.0.1，仅服务本目录（preview/），无依赖
// 用法: node preview/serve.js [端口]
const http = require('http')
const fs = require('fs')
const path = require('path')

const ROOT = __dirname
const PORT = Number(process.argv[2] || 8777)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
}

function safeJoin(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0])
  const rel = decoded === '/' || decoded === '' ? '/visual.html' : decoded
  const full = path.resolve(ROOT, '.' + rel)
  // 防目录穿越：解析后的绝对路径必须仍在 preview 目录内
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null
  return full
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('仅支持 GET / HEAD')
    return
  }
  const file = safeJoin(req.url || '/')
  if (!file) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('拒绝访问：路径越界')
    return
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('未找到: ' + req.url)
      return
    }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-store' })
    if (req.method === 'HEAD') { res.end(); return }
    fs.createReadStream(file).pipe(res)
  })
})

server.on('error', (e) => {
  if (e && e.code === 'EADDRINUSE') {
    console.error('端口被占用: ' + PORT + '（换一个端口重试，例如 node preview/serve.js ' + (PORT + 1) + '）')
  } else {
    console.error('服务错误: ' + (e && e.message))
  }
  process.exit(1)
})

server.listen(PORT, '127.0.0.1', () => {
  const url = 'http://127.0.0.1:' + PORT + '/visual.html'
  fs.writeFileSync(path.join(ROOT, '.serve-port'), String(PORT))
  console.log('预览服务已启动（仅本机可访问）')
  console.log('  ' + url)
  console.log('停止：关闭该 node 进程，或执行  Get-Process node | Stop-Process')
})