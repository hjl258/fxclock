// 环形时钟的矢量图形（纯函数，不依赖 wx）
//
// 为什么不用 canvas：
//   canvas 在部分 iOS / 开发者工具环境下会被渲染成「最上层的原生层」，
//   任何 DOM（表盘中央的文字、悬浮窗）都会被它盖住 —— 真机上表现为
//   「圆盘时钟里没有内容」+「悬浮窗被钟面压住」。
//   改成 SVG data URI 交给 <image> 渲染后，它就是普通 DOM：
//   层级按 z-index 走（悬浮窗想盖就盖得住），而且矢量在任何 dpr 下都不糊。
//
// 设计基准：viewBox 0 0 500 500，与组件宽度 500rpx 一一对应。

const BOX = 500

/** 各种半径/线宽（单位 = viewBox 单位，1 单位 = 1rpx） */
function metrics() {
  const c = BOX / 2
  const PX = BOX / 2 // 500rpx 见方 = 250px（375 设计稿 1rpx = 0.5px）
  const Rpx = PX / 2 - 2 // 旧 canvas 版：R = min(w,h)/2 - 2（px）= 123
  const R = Rpx * 2      // 换成 viewBox 单位
  return {
    box: BOX,
    c: c,
    R: R,
    tickOuter: R * 0.982,
    tickMajor: R * 0.062,
    tickMinor: R * 0.036,
    tickMajorW: 2 * Math.max(2, Rpx * 0.0135),
    tickMinorW: 2 * Math.max(1.2, Rpx * 0.0075),
    arcR: R * 0.862,
    arcW: 2 * Math.max(3, Rpx * 0.026),
    dotR: 2 * Math.max(2.6, Rpx * 0.022),
    dotRing: R * 0.93,
    innerR: R * 0.88,
    lineR: R * 0.88 + (R - R * 0.88) * 0.42,
    shadowBlur: 2 * Rpx * 0.17,
    shadowY: 2 * Rpx * 0.055
  }
}

const DOTS = [
  { a: -90, c: 'rgb(79,212,232)' },
  { a: 0, c: 'rgb(139,124,224)' },
  { a: 90, c: 'rgb(79,212,232)' },
  { a: 180, c: 'rgb(242,162,184)' }
]

function r2(n) {
  return Math.round(n * 100) / 100
}

/** SVG 文本 -> data URI（只需要转义几个字符，颜色一律用 rgb() 避免 # 转义） */
function toUrl(svg) {
  return 'data:image/svg+xml,' + svg
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/"/g, "'")
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
}

/** 刻度（60 格，每 5 格加长）+ 四色定位点：静态，只算一次 */
function ticksSvg() {
  const m = metrics()
  const parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + BOX + ' ' + BOX + '">']
  for (let i = 0; i < 60; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 60
    const major = i % 5 === 0
    const len = major ? m.tickMajor : m.tickMinor
    const x1 = m.c + Math.cos(a) * m.tickOuter
    const y1 = m.c + Math.sin(a) * m.tickOuter
    const x2 = m.c + Math.cos(a) * (m.tickOuter - len)
    const y2 = m.c + Math.sin(a) * (m.tickOuter - len)
    parts.push('<line x1="' + r2(x1) + '" y1="' + r2(y1) + '" x2="' + r2(x2) + '" y2="' + r2(y2) +
      '" stroke="' + (major ? 'rgba(72,84,124,0.34)' : 'rgba(72,84,124,0.15)') +
      '" stroke-width="' + r2(major ? m.tickMajorW : m.tickMinorW) + '" stroke-linecap="round"/>')
  }
  for (let i = 0; i < DOTS.length; i++) {
    const a = (DOTS[i].a * Math.PI) / 180
    parts.push('<circle cx="' + r2(m.c + Math.cos(a) * m.dotRing) + '" cy="' + r2(m.c + Math.sin(a) * m.dotRing) +
      '" r="' + r2(m.dotR) + '" fill="' + DOTS[i].c + '"/>')
  }
  parts.push('</svg>')
  return toUrl(parts.join(''))
}

/** 进度弧的 path：从 12 点开始顺时针扫 sweepDeg 度（纯函数，方便单测） */
function arcPath(sweepDeg) {
  const m = metrics()
  const sweep = Math.max(0.01, Math.min(359.99, sweepDeg))
  const a0 = -Math.PI / 2
  const a1 = a0 + (sweep * Math.PI) / 180
  const x0 = m.c + Math.cos(a0) * m.arcR
  const y0 = m.c + Math.sin(a0) * m.arcR
  const x1 = m.c + Math.cos(a1) * m.arcR
  const y1 = m.c + Math.sin(a1) * m.arcR
  const large = sweep > 180 ? 1 : 0
  return 'M ' + r2(x0) + ' ' + r2(y0) + ' A ' + r2(m.arcR) + ' ' + r2(m.arcR) + ' 0 ' + large + ' 1 ' + r2(x1) + ' ' + r2(y1)
}

/** 进度弧：progress 0..1（当前分钟内走过的比例），太短就不画 */
function arcSvg(progress) {
  const m = metrics()
  const head = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + BOX + ' ' + BOX + '">'
  const p = typeof progress === 'number' && isFinite(progress) ? progress : 0
  if (p <= 0.004) return toUrl(head + '</svg>')
  const defs = '<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="' + r2(m.c - m.R) + '" y1="' + r2(m.c - m.R) +
    '" x2="' + r2(m.c + m.R * 0.7) + '" y2="' + r2(m.c + m.R) + '">' +
    '<stop offset="0" stop-color="rgb(198,205,246)"/><stop offset="0.5" stop-color="rgb(180,189,242)"/>' +
    '<stop offset="1" stop-color="rgb(163,175,240)"/></linearGradient></defs>'
  return toUrl(head + defs + '<path d="' + arcPath(p * 360) + '" fill="none" stroke="url(#g)" stroke-width="' +
    r2(m.arcW) + '" stroke-linecap="round"/></svg>')
}

module.exports = {
  BOX: BOX,
  metrics: metrics,
  ticksSvg: ticksSvg,
  arcSvg: arcSvg,
  arcPath: arcPath,
  toUrl: toUrl
}
