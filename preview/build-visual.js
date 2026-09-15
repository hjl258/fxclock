// 由已生成的预览页构建单个自包含可交互预览（无外部引用、无 eval）
const fs = require('fs')
const path = require('path')

const EVAL_FAILURES = new Set()
const ROOT = path.resolve(__dirname, '..')
const OUT = process.argv[2]
if (!OUT) { console.error('用法: node preview/build-visual.js <输出文件绝对路径>'); process.exit(1) }

const BASE = Date.UTC(2026, 8, 14, 20, 6, 22, 500) - 8 * 3600 * 1000

const PAGES = [
  { key: 'clock', file: 'clock.html', label: '首页', caption: '抢购卡片 · 环形时钟 · 时间源入口 · 悬浮窗按钮', ring: true },
  { key: 'float', file: 'clock-float.html', label: '悬浮窗', caption: '深色胶囊 · 顶部延迟/时间源 · 大字时间（十分位橙色）', ring: true },
  { key: 'clicker', file: 'clicker.html', label: '点击', caption: '底栏中间项（内容待设计）', ring: false },
  { key: 'events', file: 'events.html', label: '抢购事件', caption: '首页卡片点进来：设为卡片 / 删除 / 新建', ring: false },
  { key: 'timeSource', file: 'timeSource.html', label: '时间源', caption: '手动微调 · 多源校准 · 同步状态', ring: false },
  { key: 'mine', file: 'mine.html', label: '我的', caption: '时间源切换 · 提醒开关 · 关于与清除数据', ring: false }
]

function extractRenderBody(jsFile) {
  const src = fs.readFileSync(path.join(ROOT, jsFile), 'utf8')
  const start = src.indexOf('render() {')
  let i = src.indexOf('{', start), depth = 0, end = -1
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++
    else if (src[j] === '}') { depth--; if (depth === 0) { end = j; break } }
  }
  return src.slice(i + 1, end)
}
const RING_SVG_SRC = fs.readFileSync(path.join(ROOT, 'utils/ringSvg.js'), 'utf8')
const TIME_SRC = fs.readFileSync(path.join(ROOT, 'utils/time.js'), 'utf8')

function scopeCss(css, scope) {
  let out = css.replace(/\/\*[\s\S]*?\*\//g, '')
  out = out.replace(/position:\s*fixed/g, 'position: absolute')
  out = out.replace(/(^|[^\d.])100vh/g, '$1812px')
  out = out.replace(/78vh/g, '633px')
  const rules = []
  out.split('}').forEach((chunk) => {
    const idx = chunk.indexOf('{')
    if (idx < 0) return
    const selPart = chunk.slice(0, idx).trim()
    const decl = chunk.slice(idx + 1).trim()
    if (!selPart || !decl) return
    if (selPart.charAt(0) === '@') { rules.push(selPart + '{' + decl + '}'); return }
    const scoped = selPart.split(',').map((s) => {
      const sel = s.trim().replace(/^(html|body)$/, '')
      return sel ? scope + ' ' + sel : scope
    }).join(',')
    rules.push(scoped + '{' + decl + '}')
  })
  return rules.join('\n')
}

function extract(html) {
  const style = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || ''
  const bodyStart = html.indexOf('<body>')
  const scriptStart = html.lastIndexOf('<script>')
  const bodyEnd = scriptStart > bodyStart ? scriptStart : html.indexOf('</body>')
  const body = html.slice(bodyStart + '<body>'.length, bodyEnd).replace(/<script>[\s\S]*?<\/script>/g, '')
  return { style: style, body: body.trim() }
}

const screens = []
const cssParts = []
const draws = []

PAGES.forEach((page) => {
  const parts = extract(fs.readFileSync(path.join(__dirname, page.file), 'utf8'))
  const scope = '#fm-screen-' + page.key
  cssParts.push(scopeCss(parts.style, scope))
  const body = parts.body.replace(/class="ring-arc"/g, 'class="ring-arc" id="ring-' + page.key + '"')
  screens.push('      <div class="fm-screen" id="fm-screen-' + page.key + '" data-page="' + page.key + '">' + body + '</div>')
  if (page.ring) draws.push("    drawRing('ring-" + page.key + "');")
})

const fragment = [
  '<div id="fm-root">',
  '<style>',
  '#fm-root{font-family:-apple-system,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;-webkit-font-smoothing:antialiased}',
  '#fm-root *{box-sizing:border-box}',
  '#fm-bar{display:flex;gap:8px;flex-wrap:wrap;padding:2px 2px 14px}',
  '#fm-bar button{appearance:none;font:inherit;font-size:13.5px;line-height:1;padding:9px 15px;border-radius:10px;cursor:pointer;',
  '  color:inherit;background:rgba(127,133,150,.12);border:1px solid rgba(127,133,150,.28);transition:background .15s,border-color .15s,color .15s}',
  '#fm-bar button:hover{border-color:rgba(127,133,150,.5)}',
  '#fm-bar button.fm-on{background:linear-gradient(135deg,#5aa9f8,#2f6ff0);border-color:transparent;color:#fff;font-weight:600;',
  '  box-shadow:0 6px 18px rgba(59,127,240,.35)}',
  '#fm-holder{width:100%}',
  '#fm-frame{position:relative;width:375px;height:812px;border-radius:40px;overflow:hidden;background:#eef1f7;',
  '  transform-origin:top left;box-shadow:0 0 0 7px #1b2130,0 0 0 8px #2c3446,0 26px 60px rgba(10,14,24,.45)}',
  '#fm-root .fm-screen{position:absolute;left:0;top:0;width:375px;height:812px;overflow-x:hidden;overflow-y:auto;display:none}',
  '#fm-root .fm-screen.fm-active{display:block}',
  '#fm-root .fm-screen::-webkit-scrollbar{width:0}',
  '#fm-caption{margin-top:16px;font-size:12.5px;line-height:1.7;color:#8b93a7}',
  '#fm-caption b{color:inherit;font-weight:600;opacity:.9}',
  cssParts.join('\n'),
  '</style>',
  '  <div id="fm-bar">',
  PAGES.map((p, i) => '    <button type="button" data-target="' + p.key + '"' + (i === 0 ? ' class="fm-on"' : '') + '>' + p.label + '</button>').join('\n'),
  '  </div>',
  '  <div id="fm-holder">',
  '    <div id="fm-frame">',
  screens.join('\n'),
  '    </div>',
  '  </div>',
  '  <div id="fm-caption"></div>',
  '<script>',
  '(function () {',
  '  var root = document.getElementById("fm-root");',
  '  if (!root) return;',
  '  var frame = document.getElementById("fm-frame");',
  '  var holder = document.getElementById("fm-holder");',
  '  var caption = document.getElementById("fm-caption");',
  '  var CAPS = ' + JSON.stringify(PAGES.map((p) => ({ key: p.key, label: p.label, caption: p.caption }))) + ';',
  '',
  '  function fit() {',
  '    var avail = holder.clientWidth || 375;',
  '    var k = Math.min(1, avail / 375);',
  '    frame.style.transform = "scale(" + k + ")";',
  '    holder.style.height = Math.round(812 * k) + "px";',
  '  }',
  '',
  '  function show(key) {',
  '    var screens = root.querySelectorAll(".fm-screen");',
  '    for (var i = 0; i < screens.length; i++) {',
  '      screens[i].className = "fm-screen" + (screens[i].getAttribute("data-page") === key ? " fm-active" : "");',
  '    }',
  '    var cap = null;',
  '    for (var m = 0; m < CAPS.length; m++) { if (CAPS[m].key === key) cap = CAPS[m]; }',
  '    caption.innerHTML = cap ? ("<b>" + cap.label + "</b> · " + cap.caption) : "";',
  '    var btns = root.querySelectorAll("#fm-bar button");',
  '    for (var j = 0; j < btns.length; j++) {',
  '      btns[j].className = btns[j].getAttribute("data-target") === key ? "fm-on" : "";',
  '    }',
  '  }',
  '',
  '  // 先把界面和交互准备好，保证绘图出问题也不影响切换',
  '  var buttons = root.querySelectorAll("#fm-bar button");',
  '  for (var b = 0; b < buttons.length; b++) {',
  '    buttons[b].addEventListener("click", function () { show(this.getAttribute("data-target")); });',
  '  }',
  '  if (window.addEventListener) window.addEventListener("resize", fit);',
  '  fit();',
  '  show("clock");',
  '',
  '  var time = null;',
  '  try { time = (function () { var module = { exports: {} }; var exports = module.exports;' + TIME_SRC + '; return module.exports; })(); } catch (e) { time = null; }',
  '  var ringSvg = null;',
  '  try { ringSvg = (function () { var module = { exports: {} }; var exports = module.exports;' + RING_SVG_SRC + '; return module.exports; })(); } catch (e) { ringSvg = null; }',
  '',
  '  // 环形时钟：表盘/刻度是静态 SVG（构建期就写进 DOM），这里只补进度弧与文字',
  '  function drawRing(id) {',
  '    if (!time || !ringSvg) return;',
  '    var img = document.getElementById(id);',
  '    if (!img || img.getAttribute("data-drawn") === "1") return;',
  '    var screen = img.closest(".fm-screen");',
  '    var real = Date.now;',
  '    Date.now = function () { return ' + BASE + '; };',
  '    try {',
  '      var p = time.parts(' + BASE + ', "beijing");',
  '      img.setAttribute("src", ringSvg.arcSvg((p.seconds + p.ms / 1000) / 60));',
  '      img.setAttribute("data-drawn", "1");',
  '      if (screen) {',
  '        var t = screen.querySelector(".ring-time");',
  '        if (t) t.textContent = time.formatClock(p);',
  '      }',
  '    } catch (e) {} finally { Date.now = real }',
  '  }',
  '',
  '  try {',
  draws.join('\n'),
  '  } catch (e) {}',
  '})();',
  '</script>',
  '</div>',
  ''
].join('\n')

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, fragment)
if (EVAL_FAILURES.size) console.log('⚠️ 表达式求值失败 ' + EVAL_FAILURES.size + ' 处（预览 mock 可能缺字段）: ' + Array.from(EVAL_FAILURES).slice(0, 6).join(' | '))
console.log('片段已写出: ' + OUT)
console.log('片段大小: ' + (fragment.length / 1024).toFixed(1) + ' KB')

// ---- 同时写一份完整独立网页（供文件查看器/浏览器直接渲染）----
const styleBlock = (fragment.match(/<style>[\s\S]*?<\/style>/) || [''])[0]
const bodyOnly = fragment.replace(styleBlock, '').trim()
const standalone = [
  '<!DOCTYPE html>',
  '<html lang="zh-CN">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>悬浮时钟 · 页面预览</title>',
  '<style>',
  'html,body{margin:0;padding:0}',
  'body{min-height:100vh;box-sizing:border-box;padding:26px 22px 40px;background:#0f1320;color:#e8ecf6;',
  '  font-family:-apple-system,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;',
  '  background-image:radial-gradient(60% 40% at 85% 6%,rgba(118,226,212,.14),rgba(118,226,212,0) 70%),',
  '    radial-gradient(50% 36% at 4% 26%,rgba(246,192,212,.14),rgba(246,192,212,0) 70%)}',
  '#fx-wrap{max-width:560px;margin:0 auto}',
  '#fx-head{font-size:15px;font-weight:600;letter-spacing:.4px;margin:0 0 16px}',
  '#fx-note{font-size:12.5px;line-height:1.7;color:#8b93a7;margin:16px 0 0}',
  'code{font-size:12px;color:#9fb4ff}',
  '</style>',
  styleBlock,
  '</head>',
  '<body>',
  '<div id="fx-wrap">',
  '  <div id="fx-head">悬浮时钟 · 四个页面</div>',
  bodyOnly,
  '  <div id="fx-note">顶部按钮切换页面；手机框内可上下滚动。整页按 375×812 逻辑像素渲染，底部胶囊栏位置与真机一致。</div>',
  '</div>',
  '</body>',
  '</html>',
  ''
].join('\n')
const STANDALONE = process.argv[3]
if (STANDALONE) {
  fs.mkdirSync(path.dirname(STANDALONE), { recursive: true })
  fs.writeFileSync(STANDALONE, standalone)
  console.log('独立网页已写出: ' + STANDALONE)
  console.log('独立网页大小: ' + (standalone.length / 1024).toFixed(1) + ' KB')
}