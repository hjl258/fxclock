// 生成「活」的网页预览：真机外框 + 真实走时 + 真实交互（复用项目代码，无 eval、无外部资源）
const fs = require('fs')
const path = require('path')

const EVAL_FAILURES = new Set()
const ROOT = path.resolve(__dirname, '..')
const OUT = process.argv[2] || path.join(__dirname, 'live.html')
const LIVE_EVENTS_SRC = fs.readFileSync(path.join(__dirname, 'live-events.js'), 'utf8')
const LIVE_SOURCES_SRC = fs.readFileSync(path.join(__dirname, 'live-sources.js'), 'utf8')
const LIVE_TASKS_SRC = fs.readFileSync(path.join(__dirname, 'live-tasks.js'), 'utf8')
const SOURCES_SRC = fs.readFileSync(path.join(ROOT, 'utils/sources.js'), 'utf8')
const SCALE = 0.5

const icons = require(path.join(ROOT, 'utils/icons.js'))
const time = require(path.join(ROOT, 'utils/time.js'))
const sources = require(path.join(ROOT, 'utils/sources.js'))
const tasksMod = require(path.join(ROOT, 'utils/tasks.js'))

/* ---------- WXML -> HTML（复用预览渲染器） ---------- */
const TAGMAP = { view: 'div', text: 'span', image: 'img', canvas: 'canvas', switch: 'input', 'scroll-view': 'div', picker: 'div', block: 'div', input: 'input', 'movable-area': 'div', 'movable-view': 'div' }
const COMPONENTS = {}

function rpx2px(str) { return String(str).replace(/(-?\d*\.?\d+)rpx/g, (m, n) => (parseFloat(n) * SCALE).toFixed(3) + 'px') }
function evalExpr(expr, scope) {
  try { const v = new Function('scope', 'with (scope) { return (' + expr + '); }')(scope); return v === undefined || v === null ? '' : v } catch (e) { EVAL_FAILURES.add(String(expr).trim()); return '' }
}
function interpolate(str, scope) {
  return str.replace(/\{\{([\s\S]*?)\}\}/g, (m, expr) => {
    const v = evalExpr(expr.trim(), scope)
    return typeof v === 'string' ? v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;') : String(v)
  })
}
function renderChild(node, scope) { return (node.type === 'tag' && COMPONENTS[node.tag]) ? COMPONENTS[node.tag](scope) : renderNode(node, scope) }
function renderNode(node, scope) {
  if (node.type === 'text') return interpolate(node.value, scope)
  const attrs = node.attrs
  if (attrs['wx:if'] !== undefined) { const c = interpolate(attrs['wx:if'], scope); if (c === 'false' || c === '' || c === '0') return '' }
  if (attrs['wx:for'] !== undefined) {
    const list = evalExpr(attrs['wx:for'].replace(/^\{\{|\}\}$/g, '').trim(), scope) || []
    let out = ''
    const itemName = attrs['wx:for-item'] || 'item'
    const idxName = attrs['wx:for-index'] || 'index'
    for (let i = 0; i < list.length; i++) {
      const child = Object.assign({}, scope); child[itemName] = list[i]; child[idxName] = i
      const clone = Object.assign({}, node, { attrs: Object.assign({}, attrs) })
      delete clone.attrs['wx:for']
      out += renderChild(clone, child)
    }
    return out
  }
  const tag = node.tag
  if (tag === 'block') return node.children.map(function (c) { return renderChild(c, scope) }).join('')
  const htmlTag = TAGMAP[tag] || tag
  let attrStr = ''
  if (attrs.id) attrStr += ' id="' + interpolate(attrs.id, scope) + '"'
  if (attrs.class) attrStr += ' class="' + interpolate(attrs.class, scope) + '"'
  if (attrs.style) attrStr += ' style="' + rpx2px(interpolate(attrs.style, scope)) + '"'
  // data-* 透传（步进按钮的 data-key / data-delta 等交互数据靠它）
  Object.keys(attrs).forEach(function (k) {
    if (k.indexOf('data-') !== 0) return
    attrStr += ' ' + k + '="' + interpolate(attrs[k], scope) + '"'
  })
  if (tag === 'image') { const src = attrs.src ? interpolate(attrs.src, scope) : ''; if (!src) return ''; attrStr += ' src="' + src + '"' }
  if (tag === 'switch') {
    const checked = attrs.checked ? interpolate(attrs.checked, scope) : 'false'
    attrStr += ' type="checkbox" class="switch-el ' + (attrs.class ? interpolate(attrs.class, scope) : '') + '"' + (checked === 'true' ? ' checked' : '')
  }
  if (tag === 'input') attrStr += ' value="' + (attrs.value ? interpolate(attrs.value, scope) : '') + '"'
  // 支持 wx:if / wx:elif / wx:else 链（此前只认 wx:if，导致 wx:else 分支被无条件渲染）
  let lastCond = null
  const inner = node.children.map((c) => {
    if (c.type === 'text') return renderChild(c, scope)
    const a = c.attrs || {}
    const truthy = (v) => !(v === 'false' || v === '' || v === '0')
    if (a['wx:if'] !== undefined) {
      lastCond = truthy(interpolate(a['wx:if'], scope))
      return lastCond ? renderChild(c, scope) : ''
    }
    if (a['wx:elif'] !== undefined) {
      if (lastCond === true) return ''
      lastCond = truthy(interpolate(a['wx:elif'], scope))
      return lastCond ? renderChild(c, scope) : ''
    }
    if (a['wx:else'] !== undefined) {
      const show = lastCond !== true
      lastCond = null
      return show ? renderChild(c, scope) : ''
    }
    lastCond = null
    return renderChild(c, scope)
  }).join('')
  if (node.selfClose || ['img', 'input', 'br'].indexOf(htmlTag) >= 0) return '<' + htmlTag + attrStr + '>'
  return '<' + htmlTag + attrStr + '>' + inner + '</' + htmlTag + '>'
}
function parseWxml(src) {
  src = src.replace(/<!--[\s\S]*?-->/g, '')
  const root = { type: 'root', children: [] }
  const stack = [root]
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^>]*?)?)(\/?)>|([^<]+)/g
  let m
  while ((m = re.exec(src))) {
    if (m[5] !== undefined) { if (m[5].trim()) stack[stack.length - 1].children.push({ type: 'text', value: m[5] }); continue }
    if (m[1] === '/') { if (stack.length > 1) stack.pop(); continue }
    const attrs = {}
    const are = /([\w:.-]+)\s*=\s*"([^"]*)"/g
    // 无值属性（如 wx:else、out-of-bounds）也要读进来
    const bareSrc = (m[3] || '').replace(/[\w:.-]+\s*=\s*"[^"]*"/g, ' ')
    const bareRe = /[a-zA-Z][\w:.-]*/g
    let bareMatch
    while ((bareMatch = bareRe.exec(bareSrc))) attrs[bareMatch[0]] = 'true'
    let a
    while ((a = are.exec(m[3] || ''))) attrs[a[1]] = a[2]
    const node = { type: 'tag', tag: m[2], attrs: attrs, children: [], selfClose: m[4] === '/' }
    stack[stack.length - 1].children.push(node)
    if (!node.selfClose) stack.push(node)
  }
  return root
}
function wxml(rel) { return parseWxml(fs.readFileSync(path.join(ROOT, rel), 'utf8')) }
function nodes(tree) { return { type: 'tag', tag: 'block', attrs: {}, children: tree.children, selfClose: false } }
function toCss(file) {
  let css = fs.readFileSync(path.join(ROOT, file), 'utf8')
  css = css.replace(/(-?\d*\.?\d+)rpx/g, (m, n) => (parseFloat(n) * SCALE).toFixed(3) + 'px')
  css = css.replace(/^\s*page\s*\{/m, 'body {').replace(/\bpage\b(?=\s*[,{])/g, 'body')
  return css
}
function scopeCss(css, scope) {
  let out = css.replace(/\/\*[\s\S]*?\*\//g, '')
  out = out.replace(/position:\s*fixed/g, 'position: absolute')
  out = out.replace(/(^|[^\d.])100vh/g, '$1812px').replace(/78vh/g, '633px')
  const rules = []
  out.split('}').forEach((chunk) => {
    const i = chunk.indexOf('{')
    if (i < 0) return
    const sel = chunk.slice(0, i).trim(), decl = chunk.slice(i + 1).trim()
    if (!sel || !decl) return
    if (sel.charAt(0) === '@') { rules.push(sel + '{' + decl + '}'); return }
    rules.push(sel.split(',').map((s) => { const t = s.trim().replace(/^(html|body)$/, ''); return t ? scope + ' ' + t : scope }).join(',') + '{' + decl + '}')
  })
  return rules.join('\n')
}
function extractRenderBody(jsFile) {
  const src = fs.readFileSync(path.join(ROOT, jsFile), 'utf8')
  const start = src.indexOf('render() {')
  let i = src.indexOf('{', start), depth = 0, end = -1
  for (let j = i; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (depth === 0) { end = j; break } } }
  return src.slice(i + 1, end)
}
function extract(html) {
  const style = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || ''
  const bodyStart = html.indexOf('<body>')
  const scriptStart = html.lastIndexOf('<script>')
  const bodyEnd = scriptStart > bodyStart ? scriptStart : html.indexOf('</body>')
  return { style: style, body: html.slice(bodyStart + '<body>'.length, bodyEnd).replace(/<script>[\s\S]*?<\/script>/g, '').trim() }
}

const RING_SVG_SRC = fs.readFileSync(path.join(ROOT, 'utils/ringSvg.js'), 'utf8') // 环形时钟的 SVG 图形（预览与真机同一份）
const TIME_SRC = fs.readFileSync(path.join(ROOT, 'utils/time.js'), 'utf8')

/* 「点击」状态圆的判定逻辑：直接从 utils/tasks.js 的 NEAR-BEGIN/END 标记之间抽出来内联，
   避免预览里再抄一份算法导致走样 */
const TASKS_SRC = fs.readFileSync(path.join(ROOT, 'utils/tasks.js'), 'utf8')
const NEAR_SRC = (function () {
  const a = TASKS_SRC.indexOf('/* NEAR-BEGIN */')
  const b = TASKS_SRC.indexOf('/* NEAR-END */')
  if (a < 0 || b < 0) throw new Error('utils/tasks.js 缺少 NEAR-BEGIN/NEAR-END 标记')
  const s = TASKS_SRC.slice(a, b).trim()
  if (s.indexOf('hasTaskNear') < 0) throw new Error('抽出的时效判定块不完整')
  return s
})()

/* ---------- 页面数据（与小程序默认值一致） ---------- */
const I = { flame: icons.icon('flame', '#4aa8f0', 40),
  goods: icons.icon('goods', '#ffffff', 32), source: icons.icon('source', '#4a5570', 48),
  alarm: icons.icon('alarm', '#8f95c6', 54), chevronUp: icons.icon('chevronUp', '#7c8497', 38),
  chevronDown: icons.icon('chevronDown', '#7c8497', 38), chevronRight: icons.icon('chevronRight', '#b7bdc9', 30),
  back: icons.icon('back', '#2c3140', 44),
  close: icons.icon('close', '#6b7280', 40),
  target: icons.icon('target', '#8b93a7', 34),
  trash: icons.icon('trash', '#c2c8d4', 34), checkOn: icons.icon('checkOn', '#2f6fd0', 42),
  refresh: icons.icon('refresh', '#9aa6bd', 36),
  clock: icons.icon('clock', '#8b93a7', 34),
  checkOff: icons.icon('checkOff', '#c9cfdb', 42), user: icons.icon('user2', '#ffffff', 56),
  vibrate: icons.icon('vibrate', '#4a5570', 40), shield: icons.icon('shield', '#4a5570', 40),
  cal: icons.icon('cal', '#4a5570', 40)
}
const SETTINGS = { source: 'beijing', haptic: true, keepScreenOn: true, fps: 60 }
const EVENT = { title: '【淘宝】茅台（MOUTAI）飞天 53%vol 500ml 贵州茅台酒', price: '1499.00' }

// 环形时钟：表盘/刻度/进度弧都是 DOM + SVG（不再用 canvas，canvas 在部分环境下会盖住 DOM）
const RING_MOCK = {
  size: 500, badgeIcon: I.alarm, timeText: '--:--:--.-', subText: '北京时间',
  ticksSvg: require(path.join(ROOT, 'utils/ringSvg.js')).ticksSvg(), arcSvg: require(path.join(ROOT, 'utils/ringSvg.js')).arcSvg(0)
}
const RING_HTML = renderNode(nodes(wxml('components/ring-clock/index.wxml')), RING_MOCK)

const CLOCK_DATA = {
  statusBarHeight: 44, navBarHeight: 44, capsulePad: 108, icons: I,
  settings: Object.assign({}, SETTINGS),
  sourceLabel: '北京时间', serverOffset: 780,
  event: EVENT, cd: { h: '00', m: '00', s: '00', t: '0' }, cdLabel: '倒计时',
  targetLabel: '--', cardState: 'card-normal',
  clockText: '--:--:--.-', cdText: '--:--:--',
  expanded: true, showSettings: true, floatOn: false
}
const MINE_DATA = {
  statusBarHeight: 44, navBarHeight: 44, capsulePad: 108,
  icons: Object.assign({}, I, { user: I.user }),
  settings: Object.assign({}, SETTINGS), sourceLabel: '北京时间', version: '1.0.0'
}
const EVENTS_LIST = [
  { title: '【淘宝】茅台（MOUTAI）飞天 53%vol 500ml 贵州茅台酒', price: '1499.00', tag: '酒类', platform: '淘宝', at: '20:00:00' },
  { title: '【京东】Apple iPhone 17 Pro Max 256GB 沙漠色钛金属', price: '9999.00', tag: '数码', platform: '京东', at: '10:00:00' }
]
function buildEventItems(activeIndex) {
  return EVENTS_LIST.map(function (ev, i) {
    var hms = time.parseHMS(ev.at)
    var ts = time.nextBeijing(hms.h, hms.m, hms.s, Date.now())
    var cd = time.countdownParts(ts, Date.now())
    return {
      id: 'evt-' + i,
      title: ev.title,
      price: ev.price,
      tag: ev.tag,
      active: i === activeIndex,
      targetLabel: time.dayOffsetLabel(ts, Date.now()) + ' ' + time.clockLabel(ts),
      cd: { h: cd.h, m: cd.m, s: cd.s, t: cd.t }
    }
  })
}
const EVENTS_DATA = {
  statusBarHeight: 44, navBarHeight: 44, capsulePad: 108,
  icons: I,
  items: buildEventItems(0),
  showAdd: true,
  form: { title: '', price: '', platform: '', tag: '酒类', kind: 'daily', at: '20:00' },
  tags: ['酒类', '数码', '球鞋', '美妆', '门票']
}

const SOURCES_DATA = {
  statusBarHeight: 44, navBarHeight: 44, capsulePad: 108,
  icons: I,
  manualText: '+0.000s',
  currentText: '--:--:--.-',
  currentName: '北京时间',
  items: sources.list().map(function (s) {
    return {
      key: s.key, name: s.name, color: s.color, badge: s.badge,
      active: s.key === sources.DEFAULT_KEY,
      time: sources.isDevice(s.key) ? time.formatClock(time.parts(Date.now(), 'device', 0)) : time.formatClock(time.parts(Date.now() + s.calibMs, 'device', 0)),
      desc: sources.descOf(s.key, 0)
    }
  })
}
const TABBAR_LIST = [{ text: '时钟', icon: 'clock' }, { text: '点击', icon: 'tap' }, { text: '我的', icon: 'user2' }]
function tabbarHtml(selected) {
  return renderNode(nodes(wxml('custom-tab-bar/index.wxml')), {
    selected: selected, list: TABBAR_LIST,
    iconList: TABBAR_LIST.map(function (it, i) { return icons.icon(it.icon, i === selected ? '#2f6fd0' : '#2c3140', 56) })
  })
}

COMPONENTS['ring-clock'] = function () { return RING_HTML }
const clockBody = renderNode(nodes(wxml('pages/clock/clock.wxml')), CLOCK_DATA).replace(/<ring-clock[^>]*>|<ring-clock[\s\S]*?<\/ring-clock>/, RING_HTML) + tabbarHtml(0)
const mineBody = renderNode(nodes(wxml('pages/mine/mine.wxml')), MINE_DATA) + tabbarHtml(2)
const TASK_SEED = tasksMod.defaultTasks().map(function (t) {
  return { parts: tasksMod.parseTime(t.time), name: t.name, repeat: t.repeat, enabled: t.enabled, place: t.place || null }
})
const CLICKER_DATA = {
  statusBarHeight: 44, navBarHeight: 44, capsulePad: 108, icons: I,
  list: tasksMod.defaultTasks().map(tasksMod.decorate),
  swipeId: '',
  floatOn: false,
    hasPlace: true,
    markerX: 50,
    markerY: 50,
    screenText: '375 × 812',
    placeText: 'X NaN · Y NaN',
    pickMode: true,
  editing: true,
  units: [
    { key: 'h', label: '时', value: '00' },
    { key: 'm', label: '分', value: '00' },
    { key: 's', label: '秒', value: '00' },
    { key: 'ms', label: '毫秒', value: '000' }
  ],
  form: { id: '', name: '', repeat: 'daily', placeLabel: 'X NaN · Y NaN', text: '00:00:00.000' }
}
const clickerBody = renderNode(nodes(wxml('pages/clicker/clicker.wxml')), CLICKER_DATA) + tabbarHtml(1)
const eventsBody = renderNode(nodes(wxml('pages/events/events.wxml')), EVENTS_DATA)
const sourcesBody = renderNode(nodes(wxml('pages/timeSource/timeSource.wxml')), SOURCES_DATA)
const FLOAT_MOCK = {
  show: true, x: 40, y: 130, w: 220, h: 118,
  latencyText: '40ms', timeMain: '--:--:--.', timeTenth: '-',
  rulerLabels: ['2.5', '2.0', '1.5', '1.0', '0.5'], rulerVisible: false, sweepPercent: 0,
  hzText: '60Hz', upText: '11', downText: '0', nearOn: false,
  label: '北京时间'
}
const floatBody = renderNode(nodes(wxml('components/float-clock/index.wxml')), FLOAT_MOCK)
const floatRulerBody = renderNode(nodes(wxml('components/float-clock/index.wxml')), Object.assign({}, FLOAT_MOCK, { mode: 'ruler' }))
const floatPerfBody = renderNode(nodes(wxml('components/float-clock/index.wxml')), Object.assign({}, FLOAT_MOCK, { mode: 'perf' }))

// 真机上「胶囊栏 / 遮罩 / 弹层 / 取点遮罩」都是 position:fixed（相对屏幕固定），
// 预览里全局做过 fixed→absolute，这里按页面作用域逐个还回来，
// 再配合手机框上的 transform，fixed 就等于「钉在手机框上」。
const fixedOverlay = (scope) => scope + ' .tabbar-wrap,' + scope + ' .mask,' + scope + ' .sheet,' + scope + ' .pick-mask{position: fixed}'
const cssParts = [
  scopeCss([toCss('app.wxss'), toCss('pages/clock/clock.wxss'), toCss('components/ring-clock/index.wxss'), toCss('custom-tab-bar/index.wxss')].join('\n'), '#live-clock'),
  scopeCss([toCss('app.wxss'), toCss('pages/mine/mine.wxss'), toCss('custom-tab-bar/index.wxss')].join('\n'), '#live-mine'),
  scopeCss([toCss('app.wxss'), toCss('pages/events/events.wxss')].join('\n'), '#live-events'),
  scopeCss([toCss('app.wxss'), toCss('pages/clicker/clicker.wxss'), toCss('custom-tab-bar/index.wxss')].join('\n'), '#live-clicker'),
  scopeCss([toCss('app.wxss'), toCss('pages/timeSource/timeSource.wxss')].join('\n'), '#live-sources'),
  scopeCss(toCss('components/float-clock/index.wxss'), '#live-float'),
  fixedOverlay('#live-clicker'),
  fixedOverlay('#live-clock'),
  fixedOverlay('#live-mine')
]

const html = [
  '<!DOCTYPE html>',
  '<html lang="zh-CN">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>悬浮时钟 · 可操作预览</title>',
  '<style>',
  'html,body{margin:0;padding:0}',
  'body{min-height:100vh;box-sizing:border-box;padding:24px 20px 40px;background:#0f1320;color:#e8ecf6;',
  '  font-family:-apple-system,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;',
  '  background-image:radial-gradient(60% 40% at 86% 4%,rgba(118,226,212,.13),rgba(118,226,212,0) 70%),',
  '    radial-gradient(50% 34% at 3% 24%,rgba(246,192,212,.13),rgba(246,192,212,0) 70%)}',
  '#live-wrap{max-width:600px;margin:0 auto}',
  '#live-title{font-size:15px;font-weight:600;margin:0 0 4px}',
  '#live-hint{font-size:12.5px;line-height:1.7;color:#8b93a7;margin:0 0 16px}',
  '#live-note{font-size:12.5px;line-height:1.8;color:#8b93a7;margin:16px 0 0}',
  /* 真机外框 */
  '.dev{position:relative;width:375px;height:812px;margin:0 auto;border-radius:46px;background:#eef1f7;transform:translateZ(0);',
  '  overflow:hidden;box-shadow:0 0 0 9px #171c28,0 0 0 10px #333c50,0 30px 70px rgba(6,9,16,.55)}',
  '.dev-screen{position:absolute;left:0;top:0;width:375px;height:812px;overflow:hidden}',
  '.dev-status{position:absolute;left:0;top:0;width:375px;height:44px;z-index:60;display:flex;align-items:center;',
  '  justify-content:space-between;padding:0 22px;font-size:14.5px;font-weight:600;color:#16181f;pointer-events:none}',
  '.dev-status .st-l{display:flex;align-items:center;gap:5px}',
  '.dev-status .st-r{display:flex;align-items:center;gap:6px}',
  '.dev-island{position:absolute;left:50%;top:11px;transform:translateX(-50%);width:104px;height:27px;border-radius:15px;',
  '  background:#05070d;z-index:61;display:flex;align-items:center;justify-content:flex-end;padding:0 9px;gap:6px;pointer-events:none}',
  '.dev-island i{display:block;width:13px;height:13px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#3a4a6b,#0a0d14)}',
  '.dev-island b{display:block;width:5px;height:5px;border-radius:50%;background:#2b3550}',
  // 右上角胶囊（真机上微信会画在这里，导航行右侧给它留了 108px）
  '.dev-capsule{position:absolute;right:10px;top:50px;width:88px;height:32px;border-radius:16px;',
  '  background:rgba(22,26,36,.05);border:1px solid rgba(22,26,36,.10);z-index:61;display:flex;align-items:center;justify-content:center;gap:8px}',
  '.dev-capsule i{display:block;width:5px;height:5px;border-radius:50%;background:rgba(22,26,36,.45)}',
  '.dev-capsule b{display:block;width:13px;height:13px;border-radius:50%;border:1.6px solid rgba(22,26,36,.45)}',
  '.dev-home{position:absolute;left:50%;bottom:9px;transform:translateX(-50%);width:134px;height:5px;border-radius:3px;',
  '  background:rgba(20,24,32,.32);z-index:62;pointer-events:none}',
  '.live-screen{position:absolute;left:0;top:0;width:375px;height:812px;overflow-x:hidden;overflow-y:auto;display:none}',
  '.live-screen.on{display:block}',
  // 弹层/取点遮罩打开时锁住页面滚动（等价真机上 catchtouchmove 拦住页面滚动）
  '.live-screen.sheet-open{overflow:hidden}',
  // 列表条目多的时候要能上下滚，并给出看得见的滑块
  // 原生滚动条在 Windows 上是覆盖式的：不占位、平时不可见、样式也改不动 ——
  // 所以直接藏掉原生条，改用下面自绘的 .dev-vbar（看得见、还能拖）
  '.live-screen::-webkit-scrollbar{width:0}',
  // 竖直方向居中，长度取手机框的 62%（上下都躲开状态栏与胶囊栏），比原来那一整条短一截
  '.dev-vbar{position:absolute;right:3px;top:50%;transform:translateY(-50%);height:62%;width:7px;z-index:55;opacity:0;transition:opacity .18s;pointer-events:none}',
  '.dev-vbar.on{opacity:1}',
  '.dev-vbar-track{position:absolute;left:0;top:0;width:100%;height:100%;border-radius:4px;background:rgba(20,24,32,.10)}',
  '.dev-vbar-thumb{position:absolute;left:0;width:100%;border-radius:4px;background:rgba(92,106,136,.88);box-shadow:0 0 0 1px rgba(255,255,255,.35) inset;pointer-events:auto;cursor:grab;transition:background .15s}',
  '.dev-vbar-thumb:hover{background:rgba(76,92,124,.95)}',
  '.dev-vbar-thumb:active{cursor:grabbing;background:rgba(60,76,110,1)}',
  '.live-hidden,.fp-hide{display:none !important}',
  'input.switch-el{-webkit-appearance:none;appearance:none;width:42px;height:24px;border-radius:12px;background:#e2e6ee;position:relative;',
  '  border:0;margin:0;cursor:pointer;flex:none;align-self:center}',
  'input.switch-el:checked{background:#3b7ff0}',
  'input.switch-el::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;',
  '  box-shadow:0 1px 3px rgba(0,0,0,.2);transition:left .18s}',
  'input.switch-el:checked::after{left:20px}',
  '.live-tap{cursor:pointer}',
  '#live-toast{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:90;padding:16px 22px;border-radius:12px;',
  '  background:rgba(0,0,0,.78);color:#fff;font-size:13.5px;opacity:0;transition:opacity .2s;pointer-events:none;white-space:nowrap}',
  '#live-toast.on{opacity:1}',
  /* 真机外框内的滚动条与安全区 */
  cssParts.join('\n'),
  '</style>',
  '</head>',
  '<body>',
  '<div id="live-wrap">',
  '  <div id="live-title">悬浮时钟 · 可操作预览</div>',
  '  <div id="live-hint">真实走时（毫秒级）、真实倒计时，按钮都可以点：切 Tab、开设置弹层、改时间源、开关悬浮窗并拖动。</div>',
  '  <div class="dev">',
  '    <div class="dev-screen">',
  '      <div class="live-screen on" id="live-clock">' + clockBody + '</div>',
  '      <div class="live-screen" id="live-mine">' + mineBody + '</div>',
  '      <div class="live-screen" id="live-events">' + eventsBody + '</div>',
  '      <div class="live-screen" id="live-clicker">' + clickerBody + '</div>',
  '      <div class="live-screen" id="live-sources">' + sourcesBody + '</div>',
  '      <div id="live-float-wrap" class="live-hidden"><div id="live-float">' + floatBody + '</div></div>',
  '      <div id="live-toast"></div>',
  '    </div>',
  '    <div class="dev-island"><b></b><i></i></div>',
  '    <div class="dev-status">',
  '      <div class="st-l"><span id="live-status-time">20:06</span>',
  '        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M20.5 3.5 3.5 20.5" stroke="#16181f" stroke-width="2.4" stroke-linecap="round"/><path d="M5 19 19 5l-4 0 0 4" fill="#16181f"/></svg>',
  '      </div>',
  '      <div class="st-r">',
  '        <svg width="17" height="12" viewBox="0 0 17 12"><rect x="0" y="7.5" width="3" height="4.5" rx="1" fill="#16181f"/><rect x="4.6" y="5.4" width="3" height="6.6" rx="1" fill="#16181f"/><rect x="9.2" y="3" width="3" height="9" rx="1" fill="#16181f"/><rect x="13.8" y="0.6" width="3" height="11.4" rx="1" fill="#16181f" opacity=".35"/></svg>',
  '        <svg width="15" height="12" viewBox="0 0 15 12"><path d="M7.5 10.6 9.9 8.2a3.4 3.4 0 0 0-4.8 0z" fill="#16181f"/><path d="M3.6 6.3a7 7 0 0 1 7.8 0" stroke="#16181f" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M1.4 3.6a10.4 10.4 0 0 1 12.2 0" stroke="#16181f" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".45"/></svg>',
  '        <svg width="26" height="13" viewBox="0 0 26 13"><rect x="0.6" y="0.6" width="21" height="11.8" rx="3.2" stroke="#16181f" stroke-opacity=".38" fill="none"/><rect x="2.2" y="2.2" width="14.4" height="8.6" rx="2" fill="#16181f"/><path d="M23.4 4.4v4.2a2.2 2.2 0 0 0 0-4.2z" fill="#16181f" fill-opacity=".38"/></svg>',
  '        <span id="live-status-batt">72</span>',
  '      </div>',
  '    </div>',
  '    <div class="dev-vbar" id="live-vbar">',
  '      <div class="dev-vbar-track"></div>',
  '      <div class="dev-vbar-thumb" id="live-vbar-thumb"></div>',
  '    </div>',
  '    <div class="dev-capsule"><i></i><i></i><i></i><b></b></div>', // 右上角胶囊占位（· · · ○）
  '    <div class="dev-home"></div>',
  '  </div>',
  '  <div id="live-note">状态栏时间、环形时钟、卡片倒计时都是实时计算的；时间源切换后环形时钟下方标签与「我的」页会同步。页面完全自包含，无外部请求。</div>',
  '</div>',
  '<script>',
  '(function () {',
  '  var root = document.getElementById("live-wrap");',
  '  if (!root) return;',
  '  var time = (function () { var module = { exports: {} }; var exports = module.exports;' + TIME_SRC + '; return module.exports; })();',
  '  var ringSvg = (function () { var module = { exports: {} }; var exports = module.exports;' + RING_SVG_SRC + ';return module.exports })();',
  '  var ICONS = ' + JSON.stringify({ checkOn: I.checkOn, checkOff: I.checkOff, chevronDown: I.chevronDown, chevronUp: I.chevronUp }) + ';',
  '  var sources = (function () { var module = { exports: {} }; var exports = module.exports;' + SOURCES_SRC + '; return module.exports; })();',
  '  var EVENTS_SEED = ' + JSON.stringify(EVENTS_LIST) + ';',
  '  var TASK_SEED = ' + JSON.stringify(TASK_SEED) + ';',
  '  var state = ' + JSON.stringify(SETTINGS) + ';',
  '  var el = function (id) { return document.getElementById(id); };',
  '  var q = function (sel, ctx) { return (ctx || root).querySelector(sel); };',
  '  var qa = function (sel, ctx) { return Array.prototype.slice.call((ctx || root).querySelectorAll(sel)); };',
  '',
  '  function toast(text) {',
  '    var t = el("live-toast");',
  '    if (!t) return;',
  '    t.textContent = text;',
  '    t.className = "on";',
  '    clearTimeout(t._timer);',
  '    t._timer = setTimeout(function () { t.className = ""; }, 1200);',
  '  }',
  '  function buzz(ms) {',
  '    if (state.haptic && navigator && navigator.vibrate) { try { navigator.vibrate(ms || 12); } catch (e) {} }',
  '  }',
  '',
  '  // ---- 环形时钟：DOM + SVG（刻度/定位点静态，进度弧按当前分钟比例更新） ----',
  '  var clockText = "--:--:--.-", lastArc = "";',
  '  function paintRing(now) {',
  '    var p = time.parts(now, state.source, 780);',
  '    var text = time.formatClock(p);',
  '    var sub = state.sourceName || "北京时间";',
  '    if (text !== clockText) {',
  '      clockText = text;',
  '      setText(q("#live-clock .ring-time"), text);',
  '      setText(q("#live-clock .ring-sub"), sub);',
  '    } else { setText(q("#live-clock .ring-sub"), sub) }',
  '    var arc = ringSvg.arcSvg((p.seconds + p.ms / 1000) / 60);',
  '    if (arc !== lastArc) {',
  '      lastArc = arc;',
  '      var node = q("#live-clock .ring-arc");',
  '      if (node && node.getAttribute("src") !== arc) node.setAttribute("src", arc);',
  '    }',
  '  }',

  '',
  '  // ---- 倒计时（真实计算：下一个北京时间 20:00） ----',
  '  var targetTs = 0, started = false;',
  '  function ensureTarget(now) { if (!targetTs || targetTs <= now) targetTs = time.nextBeijing(20, 0, 0, now) }',
  '  function paintCard(now) {',
  '    var cd = time.countdownParts(targetTs, now);',
  '    var digits = qa("#live-clock .digits .digit");',
  '    if (digits.length === 4) {',
  '      if (digits[0].textContent !== cd.h) digits[0].textContent = cd.h;',
  '      if (digits[1].textContent !== cd.m) digits[1].textContent = cd.m;',
  '      if (digits[2].textContent !== cd.s) digits[2].textContent = cd.s;',
  '      if (digits[3].textContent !== cd.t) digits[3].textContent = cd.t;',
  '    }',
  '    var t = q("#live-clock .event-target");',
  '    var label = time.dayOffsetLabel(targetTs, now) + " " + time.clockLabel(targetTs);',
  '    if (t && t.textContent !== label) t.textContent = label;',
  '    return cd.h + ":" + cd.m + ":" + cd.s;',
  '  }',
  '',
  '  function paintChrome(now) {',
  '    var p = time.parts(now, state.source, 780);',
  '    var st = el("live-status-time");',
  '    var hhmm = time.pad(p.hours) + ":" + time.pad(p.minutes);',
  '    if (st && st.textContent !== hhmm) st.textContent = hhmm;',
  '    var batt = el("live-status-batt");',
  '    if (batt && batt.textContent !== String(72)) batt.textContent = "72";',
  '  }',
  '',
  '  function paintFloat(cdText) {',
  '    var wrap = el("live-float-wrap");',
  '    if (!wrap || wrap.className.indexOf("live-hidden") >= 0) return;',
  '    var text = clockText || "--:--:--.-";',
  '    var main = text.length > 1 ? text.slice(0, text.length - 1) : text;',
  '    var tenth = text.length > 1 ? text.slice(text.length - 1) : "-";',
  '    var sec = 0;',
  '    if (text.length >= 10) { var ss = parseInt(text.slice(6, 8), 10); var tt = parseInt(text.slice(9, 10), 10); sec = (isNaN(ss) ? 0 : ss) + (isNaN(tt) ? 0 : tt / 10); }',
  '    var rulerVisible = sec >= 57.5;',
  '    var remain = targetTs ? Math.max(0, targetTs - nowMs) : 0;',
  '    var pct = rulerVisible ? Math.round(((sec - 57.5) / 2.5) * 1000) / 10 : 0;',
  '    var label = state.sourceName || "北京时间";',
  '    var lat = latencyOf(label);',
  '    var near = !!(tasksUI && typeof tasksUI.hasNear === "function" && tasksUI.hasNear(time.parts(Date.now(), state.source, 0), NEAR_WINDOW_MS));',
  '    var pills = qa("#live-float .float-pill");',
  '    for (var i = 0; i < pills.length; i++) {',
  '      var pill = pills[i];',
  '      setText(q(".fp-time", pill), main);',
  '      setText(q(".fp-tenth", pill), tenth);',
  '      setText(q(".fp-latency", pill), lat);',
  '      var dot = q(".fp-click-dot", pill);',
  '      if (dot) {',
  '        var nearCls = "fp-click-dot " + (near ? "fp-click-dot-on" : "fp-click-dot-off");',
  '        if (dot.className !== nearCls) dot.className = nearCls;',
  '      }',
  '      setText(q(".fp-source", pill), label);',
  '      setClass(q(".fp-ruler-labels", pill), "fp-ruler-labels", rulerVisible);',
  '      setClass(q(".fp-ruler-track", pill), "fp-ruler-track", rulerVisible);',
  '      setClass(q(".fp-perf", pill), "fp-perf", !rulerVisible);',
  '      var fill = q(".fp-ruler-fill", pill);',
  '      if (fill) fill.style.width = pct + "%";',
  '      var knob = q(".fp-ruler-knob", pill);',
  '      if (knob) knob.style.left = pct + "%";',
  '      setText(q(".fp-hz", pill), fpsText);',
  '      var nets = qa(".fp-net-line", pill);',
  '      if (nets[0]) setText(nets[0], "↑ " + upText + " KB/s");',
  '      if (nets[1]) setText(nets[1], "↓ " + downText + " KB/s");',
  '    }',
  '  }',
  '',
  '  function frame() {',
  '    nowMs = now;',
  '    var now = Date.now();',
  '    ensureTarget(now);',
  '    paintRing(now);',
  '    var cdText = paintCard(now);',
  '    paintChrome(now);',
  '    paintFloat(cdText);',
  '    if (sourcesUI) sourcesUI.paint(now);',
  '    if (eventsUI) eventsUI.paint(now);',
  '    frameCount++;',
  '    if (now - frameWindow >= 1000) { fpsText = Math.max(30, Math.min(144, frameCount)) + "Hz"; frameCount = 0; frameWindow = now; bumpFloatStats(); }',
  '    requestAnimationFrame(frame);',
  '  }',
  '',
  '  /* ---------- 交互 ---------- */',
  '  /* ---------- 右侧上下调节滑块（原生条在 Windows 上是覆盖式的、看不见，这里自己画）---------- */',
  '  var vbarDrag = null',
  '  function activeScreen() {',
  '    var names = ["live-clock", "live-clicker", "live-mine", "live-events", "live-sources"];',
  '    for (var i = 0; i < names.length; i++) {',
  '      var s = el(names[i]);',
  '      if (s && s.className.indexOf("on") >= 0) return s;',
  '    }',
  '    return null;',
  '  }',
  '  function paintVbar() {',
  '    var sc = activeScreen();',
  '    var bar = el("live-vbar");',
  '    var thumb = el("live-vbar-thumb");',
  '    if (!bar || !thumb) return;',
  '    var max = sc ? sc.scrollHeight - sc.clientHeight : 0;',
  '    if (!sc || max <= 1) { if (bar.className !== "dev-vbar") bar.className = "dev-vbar"; return }',
  '    if (bar.className !== "dev-vbar on") bar.className = "dev-vbar on";',
  '    var trackH = bar.offsetHeight || 500;',
  '    var h = Math.max(30, Math.round(trackH * sc.clientHeight / sc.scrollHeight));',
  '    var top = Math.round((trackH - h) * (sc.scrollTop / max));',
  '    if (thumb.style.height !== h + "px") thumb.style.height = h + "px";',
  '    if (thumb.style.top !== top + "px") thumb.style.top = top + "px";',
  '  }',
  '  function bindVbar() {',
  '    var thumb = el("live-vbar-thumb");',
  '    if (!thumb) return;',
  '    thumb.addEventListener("pointerdown", function (e) {',
  '      var sc = activeScreen();',
  '      if (!sc) return;',
  '      var bar = el("live-vbar");',
  '      var trackH = (bar && bar.offsetHeight) || 500;',
  '      var h = thumb.offsetHeight || 30;',
  '      vbarDrag = { y: e.clientY, top: sc.scrollTop, k: (sc.scrollHeight - sc.clientHeight) / Math.max(1, trackH - h) };',
  '      if (thumb.setPointerCapture) { try { thumb.setPointerCapture(e.pointerId) } catch (err) {} }',
  '      e.preventDefault();',
  '    });',
  '    var onMove = function (e) {',
  '      if (!vbarDrag) return;',
  '      var sc = activeScreen();',
  '      if (!sc) { vbarDrag = null; return }',
  '      sc.scrollTop = vbarDrag.top + (e.clientY - vbarDrag.y) * vbarDrag.k;',
  '      paintVbar();',
  '      e.preventDefault();',
  '    };',
  '    var onUp = function () { vbarDrag = null };',
  '    window.addEventListener("pointermove", onMove);',
  '    window.addEventListener("pointerup", onUp);',
  '    window.addEventListener("pointercancel", onUp);',
  '    qa(".live-screen").forEach(function (s) { s.addEventListener("scroll", paintVbar) });',
  '    window.addEventListener("resize", paintVbar);',
  '  }',
  '  setInterval(paintVbar, 250);  // 列表增删 / 弹层开关都会改可滚高度，定时刷最稳',


  '  function switchTab(index) {',
  '    var eventsScreen = el("live-events");',
  '    if (eventsScreen) eventsScreen.className = "live-screen";',
  '    var names = ["live-clock", "live-clicker", "live-mine"];',
  '    for (var i = 0; i < names.length; i++) {',
  '      var scr = el(names[i]);',
  '      if (scr) scr.className = "live-screen" + (i === index ? " on" : "");',
  '    }',
  '    syncFloatState();',
  '    paintVbar();',
    '    buzz(8);',
  '  }',
  '  // 时间源统一入口：环形时钟 / 首页文案 / 我的 三处联动',
  '  var nowMs = Date.now();',
  '  var fpsText = "60Hz", upText = "11", downText = "0";',
  '  var frameCount = 0, frameWindow = Date.now();',
  '  function latencyOf(name) {',
  '    var h = 0, s = String(name || "");',
  '    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 97;',
  '    return (32 + (h % 14)) + "ms";',
  '  }',
  '  function setText(node, value) {',
  '    if (node && node.textContent !== value) node.textContent = value;',
  '  }',
  '  function setClass(node, base, show) {',
  '    if (!node) return;',
  '    var next = show ? base : base + " fp-hide";',
  '    if (node.className !== next) node.className = next;',
  '  }',
  '  function bumpFloatStats() {',
  '    upText = String(Math.max(0, Math.round(Number(upText) + (Math.random() - 0.45) * 6)));',
  '    downText = String(Math.max(0, Math.round(Number(downText) + (Math.random() - 0.5) * 4)));',
  '  }',

  '  // 悬浮窗开关的唯一真值来源 = 悬浮窗是否真实可见（与首页按钮、点击页状态条共用）',
  '  var tasksUI = null;',
  '  function floatIsOn() {',
  '    var wrap = el("live-float-wrap");',
  '    return !!(wrap && wrap.className.indexOf("live-hidden") < 0);',
  '  }',
  '  function syncFloatState() {',
  '    if (tasksUI && typeof tasksUI.syncFloat === "function") tasksUI.syncFloat();',
  '  }',
  '  var clockCtl = {',
  '    setSource: function (o) {',
  '      state.source = o.source;',
  '      state.sourceName = o.name;',
  '      // 环形时钟的 paintRing 直接读 state.source，这里不用再同步组件实例',
  '      var quick = q("#live-clock .quick-sub");',
  '      if (quick) quick.textContent = o.name;',
  '      var profile = q("#live-mine .profile-sub");',
  '      if (profile) profile.textContent = "毫秒级走时 · 当前时间源 " + o.name;',
  '    },',
  '    getTarget: function () { return targetTs; },',
  '    setTarget: function (v) { targetTs = v; }',
  '  };',
  '  function syncSwitches() {',
  '    var keys = ["haptic", "keepScreenOn"];',
  '    qa("input.switch-el").forEach(function (el2) {',
  '      var box = el2.closest(".panel-row") || el2.closest(".radio-row") || el2.closest(".row-item");',
  '      if (!box) return;',
  '      var label = q(".panel-label", box) || q(".row-label", box);',
  '      if (!label) return;',
  '      var text = label.textContent;',
  '      var key = text.indexOf("震动") >= 0 ? "haptic" : (text.indexOf("常亮") >= 0 ? "keepScreenOn" : null);',
  '      if (!key) return;',
  '      el2.checked = !!state[key];',
  '    });',
  '  }',
  '  function hidePanel() {\n    var panel = q("#live-clock .panel");\n    if (panel && panel.className.indexOf("live-hidden") < 0) togglePanel();\n  }',
  '  function togglePanel() {',
  '    var panel = q("#live-clock .panel");',
  '    var icon = q("#live-clock .collapse-icon");',
  '    if (!panel) return;',
  '    var hidden = panel.className.indexOf("live-hidden") >= 0;',
  '    panel.className = hidden ? "panel" : "panel live-hidden";',
  '    if (icon) icon.src = hidden ? ICONS.chevronDown : ICONS.chevronUp;',
  '    buzz(8);',
  '  }',
  '  function showFloat() {',
  '    var wrap = el("live-float-wrap");',
  '    if (wrap) wrap.className = "";',
  '    var btn = q("#live-clock .primary-btn");',
  '    if (btn) btn.textContent = "关闭悬浮窗";',
  '    syncFloatState();',
  '    var pills = wrap ? qa(".float-pill", wrap) : [];',
  '    for (var pi = 0; pi < pills.length; pi++) {',
  '      if (pills[pi].getAttribute("data-pos")) continue;',
  '      pills[pi].setAttribute("data-pos", "1");',
  '      makeDraggable(pills[pi]);',
  '    }',
  '    buzz(10);',
  '  }',
  '  function hideFloat() {',
  '    var wrap = el("live-float-wrap");',
  '    if (wrap && wrap.className.indexOf("live-hidden") < 0) wrap.className = "live-hidden";',
  '    var btn = q("#live-clock .primary-btn");',
  '    if (btn) btn.textContent = "开启悬浮窗";',
  '    syncFloatState();',
  '  }',
  '  function makeDraggable(node) {',
  '    var dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;',
  '    var MARGIN = 8, TOP_SAFE = 44;',
  '    node.style.cursor = "grab";',
  '    node.addEventListener("pointerdown", function (e) {',
  '      dragging = true;',
  '      node.style.cursor = "grabbing";',
  '      sx = e.clientX; sy = e.clientY;',
  '      ox = parseFloat(node.style.left) || 0;',
  '      oy = parseFloat(node.style.top) || 0;',
  '      if (node.setPointerCapture) { try { node.setPointerCapture(e.pointerId); } catch (err) {} }',
  '      e.preventDefault();',
  '    });',
  '    node.addEventListener("pointermove", function (e) {',
  '      if (!dragging) return;',
  '      if (Math.abs(e.clientX - sx) > 6 || Math.abs(e.clientY - sy) > 6) moved = true;',
  '      var maxX = Math.max(MARGIN, 375 - node.offsetWidth - MARGIN);',
  '      var maxY = Math.max(TOP_SAFE, 812 - node.offsetHeight - MARGIN);',
  '      node.style.left = Math.min(maxX, Math.max(MARGIN, ox + (e.clientX - sx))) + "px";',
  '      node.style.top = Math.min(maxY, Math.max(TOP_SAFE, oy + (e.clientY - sy))) + "px";',
  '    });',
  '    function end() { dragging = false; moved = false; node.style.cursor = "grab"; }',
  '    node.addEventListener("pointerup", end);',
  '    node.addEventListener("pointercancel", end);',
  '  }',
  '',
  '  /* ---------- 绑定 ---------- */',
  '  qa(".tabbar-wrap").forEach(function (bar) {',
  '    qa(".tab-item", bar).forEach(function (item, i) {',
  '      item.classList.add("live-tap");',
  '      item.addEventListener("click", function () { switchTab(i); });',
  '    });',
  '  });',
  '  var collapse = q("#live-clock .collapse");',
  '  if (collapse) { collapse.classList.add("live-tap"); collapse.addEventListener("click", togglePanel); }',
  '  var primary = q("#live-clock .primary-btn");',
  '  if (primary) {',
  '    primary.classList.add("live-tap");',
  '    primary.addEventListener("click", function () {',
  '      var wrap = el("live-float-wrap");',
  '      if (wrap && wrap.className.indexOf("live-hidden") >= 0) showFloat(); else hideFloat();',
  '    });',
  '  }',
  '  // 「我的 → 清除本地数据」：恢复 6 组预设（与真机 store.resetAll 行为一致）',
  '  qa("#live-mine .row-item").forEach(function (row) {',
  '    var label = q(".row-label", row);',
  '    if (!label || label.textContent.indexOf("清除本地数据") < 0) return;',
  '    row.classList.add("live-tap");',
  '    row.addEventListener("click", function () {',
  '      var n2 = tasksUI && tasksUI.resetTasks ? tasksUI.resetTasks() : 0;',
  '      toast("已恢复 " + n2 + " 组预设");',
  '      buzz(12);',
  '    });',
  '  });',
  '  // 「我的」页的时间源行已按需求删除 —— 不要在这里再用位置选择器绑 row-item，',
  '  // 否则会命中下一条「抢购震动提醒」。时间源统一从首页入口进。',
  '  qa("#live-clock .panel-row").forEach(function (row) {',
  '    row.classList.add("live-tap");',
  '    row.addEventListener("click", function (e) {',
  '      if (e.target && e.target.tagName === "INPUT") return;',
  '      var box = q("input.switch-el", row);',
  '      if (box) { box.checked = !box.checked; box.dispatchEvent(new Event("change")); }',
  '    });',
  '  });',
  '  qa("input.switch-el").forEach(function (box) {',
  '    box.addEventListener("change", function () {',
  '      var container = box.closest(".panel-row") || box.closest(".row-item");',
  '      var label = container ? (q(".panel-label", container) || q(".row-label", container)) : null;',
  '      var text = label ? label.textContent : "";',
  '      var key = text.indexOf("震动") >= 0 ? "haptic" : (text.indexOf("常亮") >= 0 ? "keepScreenOn" : null);',
  '      if (!key) return;',
  '      state[key] = !!box.checked;',
  '      syncSwitches();',
  '      buzz(8);',
  '      toast(label.textContent.replace(/^\\s+|\\s+$/g, "") + (box.checked ? " 已开启" : " 已关闭"));',
  '    });',
  '  });',
  '  var fpsSegs = qa("#live-clock .panel .seg-item");',
  '  fpsSegs.forEach(function (seg) {',
  '    seg.classList.add("live-tap");',
  '    seg.addEventListener("click", function () {',
  '      fpsSegs.forEach(function (s) { s.className = s.className.replace(" seg-on", ""); });',
  '      seg.className = seg.className + " seg-on";',
  '      state.fps = parseInt(seg.textContent, 10) || 60;',
  '      toast("刷新精度 " + seg.textContent);',
  '    });',
  '  });',
  '',
  '  /* ---------- 初始状态 ---------- */',
  '  hidePanel();',
  '  var sourcesUI = initSourcesPreview({ el: el, q: q, qa: qa, time: time, sources: sources, toast: toast, buzz: buzz, hideFloat: hideFloat, clock: clockCtl });',
  '  tasksUI = initTasksPreview({ el: el, q: q, qa: qa, toast: toast, buzz: buzz, hideFloat: hideFloat, seed: TASK_SEED, getFloatOn: floatIsOn });',
  '  syncFloatState();',
  '  var eventsUI = initEventsPreview({ el: el, q: q, qa: qa, time: time, toast: toast, buzz: buzz, hideFloat: hideFloat, seed: EVENTS_SEED, clock: clockCtl });',
  '  syncSwitches();',
  '  bindVbar();',
  '  switchTab(0);',
  '  requestAnimationFrame(frame);',
  LIVE_EVENTS_SRC,
  LIVE_SOURCES_SRC,
  NEAR_SRC,
  LIVE_TASKS_SRC,
  '})();',
  '</script>',
  '</body>',
  '</html>',
  ''
].join('\n')

fs.writeFileSync(OUT, html)
if (EVAL_FAILURES.size) console.log('⚠️ 表达式求值失败 ' + EVAL_FAILURES.size + ' 处（预览 mock 可能缺字段）: ' + Array.from(EVAL_FAILURES).slice(0, 6).join(' | '))
console.log('已写出: ' + OUT)
console.log('大小: ' + (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1) + ' KB')