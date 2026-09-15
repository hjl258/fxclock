// 预览生成器：消费真实 WXML/WXSS，rpx->px，并复用组件的真实 render()/setData
const fs = require('fs')
const path = require('path')

const EVAL_FAILURES = new Set()
const ROOT = path.resolve(__dirname, '..')
const OUT = __dirname
const SCALE = 0.5 // 1rpx = 0.5px @375

const icons = require(path.join(ROOT, 'utils/icons.js'))
const time = require(path.join(ROOT, 'utils/time.js'))
const ringSvgMod = require(path.join(ROOT, 'utils/ringSvg.js'))

/* ---------------- 固定时间基准（复刻参考图：北京时间 20:06:22.5） ---------------- */
const BASE = Date.UTC(2026, 8, 14, 20, 6, 22, 500) - 8 * 3600 * 1000
const p = time.parts(BASE, 'beijing')
const clockText = time.formatClock(p)
const TARGET = time.nextBeijing(20, 0, 0, BASE)
const cd = time.countdownParts(TARGET, BASE)

const TAGMAP = { view: 'div', text: 'span', image: 'img', canvas: 'canvas', switch: 'input', 'scroll-view': 'div', picker: 'div', block: 'div', input: 'input', 'movable-area': 'div', 'movable-view': 'div' }
const COMPONENTS = {}

function rpx2px(str) {
  return String(str).replace(/(-?\d*\.?\d+)rpx/g, (m, n) => (parseFloat(n) * SCALE).toFixed(3) + 'px')
}

function evalExpr(expr, scope) {
  try {
    const v = new Function('scope', 'with (scope) { return (' + expr + '); }')(scope)
    return v === undefined || v === null ? '' : v
  } catch (e) { EVAL_FAILURES.add(String(expr).trim()); return '' }
}

function interpolate(str, scope) {
  return str.replace(/\{\{([\s\S]*?)\}\}/g, (m, expr) => {
    const v = evalExpr(expr.trim(), scope)
    return typeof v === 'string' ? v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;') : String(v)
  })
}

function renderChild(node, scope) {
  if (node.type === 'tag' && COMPONENTS[node.tag]) return COMPONENTS[node.tag](scope)
  return renderNode(node, scope)
}

function renderNode(node, scope) {
  if (node.type === 'text') return interpolate(node.value, scope)
  const attrs = node.attrs
  if (attrs['wx:if'] !== undefined) {
    const cond = interpolate(attrs['wx:if'], scope)
    if (cond === 'false' || cond === '' || cond === '0') return ''
  }
  if (attrs['wx:for'] !== undefined) {
    const list = evalExpr(attrs['wx:for'].replace(/^\{\{|\}\}$/g, '').trim(), scope) || []
    let out = ''
    const itemName = attrs['wx:for-item'] || 'item'
    const idxName = attrs['wx:for-index'] || 'index'
    for (let i = 0; i < list.length; i++) {
      const child = Object.assign({}, scope)
      child[itemName] = list[i]
      child[idxName] = i
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
  if (tag === 'image') {
    const src = attrs.src ? interpolate(attrs.src, scope) : ''
    if (!src) return ''
    attrStr += ' src="' + src + '"'
  }
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
    if (m[5] !== undefined) {
      if (m[5].trim()) stack[stack.length - 1].children.push({ type: 'text', value: m[5] })
      continue
    }
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
  css = css.replace(/^\s*page\s*\{/m, 'body {')
  css = css.replace(/\bpage\b(?=\s*[,{])/g, 'body')
  return css
}

function extractRenderBody(jsFile) {
  const src = fs.readFileSync(path.join(ROOT, jsFile), 'utf8')
  const start = src.indexOf('render() {')
  let i = src.indexOf('{', start)
  let depth = 0, end = -1
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++
    else if (src[j] === '}') { depth--; if (depth === 0) { end = j; break } }
  }
  return src.slice(i + 1, end)
}

const RING_BODY = extractRenderBody('components/ring-clock/index.js')
const TIME_SRC = fs.readFileSync(path.join(ROOT, 'utils/time.js'), 'utf8')

/* ---------------- 图标 ---------------- */
const I = {
  flame: icons.icon('flame', '#4aa8f0', 40),
  goods: icons.icon('goods', '#ffffff', 32),
  source: icons.icon('source', '#4a5570', 48),
  alarm: icons.icon('alarm', '#8f95c6', 54),
  chevronUp: icons.icon('chevronUp', '#7c8497', 38),
  chevronDown: icons.icon('chevronDown', '#7c8497', 38),
  chevronRight: icons.icon('chevronRight', '#b7bdc9', 30),
  back: icons.icon('back', '#2c3140', 44),
  close: icons.icon('close', '#6b7280', 40),
  target: icons.icon('target', '#8b93a7', 34),
  trash: icons.icon('trash', '#c2c8d4', 34),
  checkOn: icons.icon('checkOn', '#2f6fd0', 42),
  checkOff: icons.icon('checkOff', '#c9cfdb', 42),
  user2: icons.icon('user2', '#ffffff', 56),
  vibrate: icons.icon('vibrate', '#4a5570', 40),
  shield: icons.icon('shield', '#4a5570', 40),
  cal: icons.icon('cal', '#4a5570', 40)
}
const SOURCE_OPTIONS = [
  { key: 'beijing', label: '北京时间（网络授时）' },
  { key: 'device', label: '本机时间' },
  { key: 'server', label: '服务器时间（已校准）' }
]
const SOURCE_DESC = { beijing: 'UTC+8 · 网络授时基准', device: '跟随手机系统时钟', server: '已补偿网络往返延迟' }
const SETTINGS = { source: 'beijing', haptic: true, keepScreenOn: true, fps: 60 }
const EVENT = { title: '【淘宝】茅台（MOUTAI）飞天 53%vol 500ml 贵州茅台酒', price: '1499.00', platform: '淘宝' }

/* ---------------- 组件 ---------------- */
const RING_TREE = wxml('components/ring-clock/index.wxml')
const FLOAT_TREE = wxml('components/float-clock/index.wxml')

function buildPage(opts) {
  COMPONENTS['ring-clock'] = (scope) => renderNode(nodes(RING_TREE), Object.assign({}, scope, {
    size: 500, badgeIcon: I.alarm, timeText: clockText, subText: time.sourceLabel(SETTINGS.source),
    // 刻度/定位点静态，进度弧按「本分钟内已走过的比例」算一次
    ticksSvg: ringSvgMod.ticksSvg(),
    arcSvg: ringSvgMod.arcSvg((p.seconds + p.ms / 1000) / 60)
  }))
  COMPONENTS['float-clock'] = (scope) => (opts.float ? renderNode(nodes(FLOAT_TREE), Object.assign({}, scope, {
  show: true, x: 40, y: 150, w: 220, h: 118,
  latencyText: '40ms', label: '北京时间',
  timeMain: opts.floatNear === true ? '20:25:31.' : '22:22:57.',
  timeTenth: opts.floatNear === true ? '4' : '6',
  // 基准时间 20:06:22.5 距最近任务（20:26:00.4）约 19.6 分钟 → 红点；
  // floatNear 页把时间挪到 20:25:31（差 29 秒）→ 绿点。
  nearOn: opts.floatNear === true ? true : TASK_MOD.hasTaskNear(FLOAT_TASKS, p, TASK_MOD.NEAR_WINDOW_MS),
  rulerLabels: ['2.5', '2.0', '1.5', '1.0', '0.5'],
  rulerVisible: opts.floatRuler === true, sweepPercent: opts.floatRuler === true ? 52 : 0,
  hzText: '60Hz', upText: '11', downText: '0'
})) : '')

  const body = wxml(opts.wxml).children.map((n) => renderChild(n, opts.data)).join('')

  let tab = ''
  if (opts.tab !== undefined) {
    const list = [{ text: '时钟', icon: 'clock' }, { text: '点击', icon: 'tap' }, { text: '我的', icon: 'user2' }]
    tab = renderNode(nodes(wxml('custom-tab-bar/index.wxml')), Object.assign({}, opts.data, {
      selected: opts.tab, list: list,
      iconList: list.map((it, i) => icons.icon(it.icon, i === opts.tab ? '#2f6fd0' : '#2c3140', 56))
    }))
  }

  const css = [
    'html, body { margin: 0; padding: 0; width: 375px; }',
    'img { object-fit: contain; display: block; }',
    '.switch-el { -webkit-appearance: none; appearance: none; width: 42px; height: 24px; border-radius: 12px; background: #e2e6ee; position: relative; }',
    '.switch-el:checked { background: #3b7ff0; }',
    '.switch-el::after { content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; }',
    '.switch-el:checked::after { left: 20px; }',
    toCss('app.wxss'),
    opts.css.map(toCss).join('\n')
  ].join('\n')

  const script = [
    'var RING_BODY = ' + JSON.stringify(RING_BODY) + ';',
    'var TIME_SRC = ' + JSON.stringify(TIME_SRC) + ';',
    'var time = (function () { var module = { exports: {} }; var exports = module.exports; ' + TIME_SRC + '; return module.exports; })();',
    'var FIXED = ' + BASE + ';',
    'function drawRing() {',
    '  var canvas = document.getElementById("ring");',
    '  if (!canvas) return;',
    '  var dpr = 2, w = 250, h = 250;',
    '  canvas.width = w * dpr; canvas.height = h * dpr;',
    '  canvas.style.width = w + "px"; canvas.style.height = h + "px";',
    '  var ctx = canvas.getContext("2d");',
    '  var self = {',
    '    ctx: ctx, dpr: dpr, w: w, h: h,',
    '    data: { source: "beijing", serverOffset: 0 },',
    '    setData: function (o) {',
    '      if (o.timeText !== undefined) { var e = document.querySelector(".ring-time"); if (e) e.textContent = o.timeText; }',
    '      if (o.subText !== undefined) { var s = document.querySelector(".ring-sub"); if (s) s.textContent = o.subText; }',
    '    },',
    '    triggerEvent: function () {}',
    '  };',
    '  var fn = new Function("time", "return function () {" + RING_BODY + "}")(time);',
    '  var real = Date.now;',
    '  Date.now = function () { return FIXED; };',
    '  fn.call(self);',
    '  Date.now = real;',
    '}',
    'drawRing();'
  ].join('\n')

  const html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<title>' + opts.title + '</title>\n<style>\n' + css + '\n</style>\n</head>\n<body>\n' + body + tab + '\n<script>\n' + script + '\n</' + 'script>\n</body>\n</html>\n'
  fs.writeFileSync(path.join(OUT, opts.name + '.html'), html)
  console.log('  ' + opts.name + '.html  (' + (html.length / 1024).toFixed(1) + ' KB)')
}

/* ---------------- 输出 ---------------- */
const TASK_MOD = require(path.join(ROOT, 'utils/tasks.js'))
const FLOAT_TASKS = TASK_MOD.defaultTasks() // 顶行「点击」状态圆扫描用的任务表
const TASK_LIST_PREVIEW = FLOAT_TASKS.map(TASK_MOD.decorate)
const CLOCK_CSS = ['pages/clock/clock.wxss', 'components/ring-clock/index.wxss', 'components/float-clock/index.wxss', 'custom-tab-bar/index.wxss']
const MINE_CSS = ['pages/mine/mine.wxss', 'custom-tab-bar/index.wxss']

const clockData = {
  statusBarHeight: 24, navBarHeight: 44, capsulePad: 108,
  icons: I, settings: SETTINGS, sourceOptions: SOURCE_OPTIONS, sourceDesc: SOURCE_DESC,
  sourceLabel: '北京时间', serverOffset: 0,
  event: EVENT,
  cd: { h: cd.h, m: cd.m, s: cd.s, t: cd.t },
  cdLabel: '倒计时',
  targetLabel: time.dayOffsetLabel(TARGET, BASE) + ' ' + time.clockLabel(TARGET),
  cardState: 'card-normal',
  clockText: clockText,
  cdText: time.countdownText(TARGET, BASE),
  expanded: false, showSettings: false, floatOn: false
}

/* 抢购事件页：非 Tab 页（点首页卡片进入） */
const EV_SOURCE = [
  { title: '【淘宝】茅台（MOUTAI）飞天 53%vol 500ml 贵州茅台酒', price: '1499.00', tag: '酒类', platform: '淘宝', at: '20:00:00' },
  { title: '【京东】Apple iPhone 17 Pro Max 256GB 沙漠色钛金属', price: '9999.00', tag: '数码', platform: '京东', at: '10:00:00' }
]
function eventsData(showAdd) {
  const items = EV_SOURCE.map(function (ev, i) {
    const hms = time.parseHMS(ev.at)
    const ts = time.nextBeijing(hms.h, hms.m, hms.s, Date.now())
    const c = time.countdownParts(ts, Date.now())
    return {
      id: 'evt-' + i, title: ev.title, price: ev.price, tag: ev.tag, active: i === 0,
      targetLabel: time.dayOffsetLabel(ts, Date.now()) + ' ' + time.clockLabel(ts),
      cd: { h: c.h, m: c.m, s: c.s, t: c.t }
    }
  })
  return {
    statusBarHeight: 24, navBarHeight: 44, capsulePad: 108, icons: I,
    items: items, showAdd: showAdd,
    form: { title: '', price: '', platform: '', tag: '酒类', kind: 'daily', at: '20:00' },
    tags: ['酒类', '数码', '球鞋', '美妆', '门票']
  }
}

console.log('生成预览:')
buildPage({ name: 'clock', title: '首页', wxml: 'pages/clock/clock.wxml', data: clockData, css: CLOCK_CSS, tab: 0 })
buildPage({ name: 'clock-float', title: '首页 · 悬浮窗', wxml: 'pages/clock/clock.wxml', data: Object.assign({}, clockData, { floatOn: true, expanded: true }), css: CLOCK_CSS, tab: 0, float: true })
buildPage({
  name: 'mine', title: '我的', wxml: 'pages/mine/mine.wxml',
  data: { statusBarHeight: 24, navBarHeight: 44, capsulePad: 108, icons: Object.assign({}, I, { user: I.user2 }), settings: SETTINGS, sourceLabel: '北京时间', version: '1.0.0' },
  css: MINE_CSS, tab: 1
})
buildPage({
  name: 'events', title: '抢购事件', wxml: 'pages/events/events.wxml',
  data: eventsData(false), css: ['pages/events/events.wxss']
})
buildPage({
  name: 'events-add', title: '新建抢购事件', wxml: 'pages/events/events.wxml',
  data: eventsData(true), css: ['pages/events/events.wxss']
})
const CLICKER_BASE = {
  statusBarHeight: 24, navBarHeight: 44, capsulePad: 108, icons: I,
  list: TASK_LIST_PREVIEW,
  swipeId: '',
  hasPlace: true,
  markerX: 50,
  markerY: 50,
  screenText: '375 × 812',
  placeText: 'X NaN · Y NaN',
  pickMode: false,
  floatOn: false,   // 真机默认：悬浮窗未开启 → 定时点击不生效（不再谎报）
  editing: false,
  units: [
    { key: 'h', label: '时', value: '14' },
    { key: 'm', label: '分', value: '29' },
    { key: 's', label: '秒', value: '05' },
    { key: 'ms', label: '毫秒', value: '250' }
  ],
  form: { id: '', name: '', repeat: 'daily', placeLabel: 'X NaN · Y NaN', text: '14:29:05.250' }
}
const CLICKER_CSS = ['pages/clicker/clicker.wxss', 'custom-tab-bar/index.wxss']
// 对照用：把第 1 条改成「未设坐标」，看占位文案 X NaN / Y NaN
const TASK_LIST_NOPLACE = TASK_LIST_PREVIEW.map(function (t, i) {
  if (i !== 0) return t
  return TASK_MOD.decorate({ id: 'noplace', time: t.time, name: t.name, repeat: t.repeat, place: null })
})

buildPage({ name: 'clicker', title: '定时点击', wxml: 'pages/clicker/clicker.wxml', data: CLICKER_BASE, css: CLICKER_CSS, tab: 1 })
buildPage({ name: 'clicker-noplace', title: '定时点击 · 未设坐标（占位）', wxml: 'pages/clicker/clicker.wxml',
  data: Object.assign({}, CLICKER_BASE, { list: TASK_LIST_NOPLACE, placeText: 'X NaN · Y NaN' }), css: CLICKER_CSS, tab: 1 })
buildPage({ name: 'clicker-on', title: '定时点击 · 悬浮窗已开启（对照）', wxml: 'pages/clicker/clicker.wxml',
  data: Object.assign({}, CLICKER_BASE, { floatOn: true }), css: CLICKER_CSS, tab: 1 })
buildPage({ name: 'clicker-swipe', title: '定时点击 · 左滑删除', wxml: 'pages/clicker/clicker.wxml',
  data: Object.assign({}, CLICKER_BASE, { swipeId: TASK_LIST_PREVIEW[0].id, markerX: 46, markerY: 38, placeText: 'X 172 · Y 308' }),
  css: CLICKER_CSS, tab: 1 })
buildPage({ name: 'clicker-edit', title: '定时点击 · 编辑弹层', wxml: 'pages/clicker/clicker.wxml',
  data: Object.assign({}, CLICKER_BASE, {
    markerX: 46, markerY: 38, placeText: 'X 172 · Y 308', editing: true,
    units: [
      { key: 'h', label: '时', value: '14' },
      { key: 'm', label: '分', value: '29' },
      { key: 's', label: '秒', value: '05' },
      { key: 'ms', label: '毫秒', value: '2' }
    ],
    form: { id: '', name: 'first', repeat: 'daily', place: { x: 172, y: 308 } }
  }), css: CLICKER_CSS, tab: 1 })
buildPage({
  name: 'timeSource', title: '时间源', wxml: 'pages/timeSource/timeSource.wxml',
  data: {
    statusBarHeight: 24, navBarHeight: 44, capsulePad: 108, icons: I,
    manualText: '+0.000s', currentText: time.formatClock(time.parts(Date.now(), 'device', 0)), currentName: '北京时间',
    items: require(path.join(ROOT, 'utils/sources.js')).list().map(function (s) {
      return {
        key: s.key, name: s.name, color: s.color, badge: s.badge, active: s.key === 'beijing',
        time: require(path.join(ROOT, 'utils/sources.js')).isDevice(s.key)
          ? time.formatClock(time.parts(Date.now(), 'device', 0))
          : time.formatClock(time.parts(Date.now() + s.calibMs, 'device', 0)),
        desc: require(path.join(ROOT, 'utils/sources.js')).descOf(s.key, 0)
      }
    })
  },
  css: ['pages/timeSource/timeSource.wxss']
})
buildPage({
  name: 'clock-float-near', title: '悬浮窗 · 点击状态圆（绿）', wxml: 'pages/clock/clock.wxml',
  data: Object.assign({}, clockData, { floatOn: true, expanded: true }), css: CLOCK_CSS, tab: 0, float: true, floatNear: true
})
buildPage({
  name: 'clock-ruler', title: '悬浮窗 · 刻度尺态', wxml: 'pages/clock/clock.wxml',
  data: clockData, css: CLOCK_CSS, tab: 0, float: true, floatRuler: true
})
if (EVAL_FAILURES.size) console.log('⚠️ 表达式求值失败 ' + EVAL_FAILURES.size + ' 处（预览 mock 可能缺字段）: ' + Array.from(EVAL_FAILURES).slice(0, 6).join(' | '))
console.log('完成')