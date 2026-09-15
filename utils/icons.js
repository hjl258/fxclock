// SVG -> base64 data URI（纯 ASCII，不依赖二进制资源文件）
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function b64(str) {
  let out = ''
  for (let i = 0; i < str.length; i += 3) {
    const c1 = str.charCodeAt(i)
    const c2 = i + 1 < str.length ? str.charCodeAt(i + 1) : NaN
    const c3 = i + 2 < str.length ? str.charCodeAt(i + 2) : NaN
    const e1 = c1 >> 2
    const e2 = ((c1 & 3) << 4) | (isNaN(c2) ? 0 : c2 >> 4)
    const e3 = isNaN(c2) ? 64 : (((c2 & 15) << 2) | (isNaN(c3) ? 0 : c3 >> 6))
    const e4 = isNaN(c3) ? 64 : (c3 & 63)
    out += CHARS.charAt(e1) + CHARS.charAt(e2) + (e3 === 64 ? '=' : CHARS.charAt(e3)) + (e4 === 64 ? '=' : CHARS.charAt(e4))
  }
  return out
}

function gearShape(c) {
  let d = ''
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 8
    const x1 = (12 + Math.cos(a) * 7.6).toFixed(2)
    const y1 = (12 + Math.sin(a) * 7.6).toFixed(2)
    const x2 = (12 + Math.cos(a) * 9.9).toFixed(2)
    const y2 = (12 + Math.sin(a) * 9.9).toFixed(2)
    d += 'M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2
  }
  return '<circle cx="12" cy="12" r="6.6" fill="none" stroke="' + c + '" stroke-width="2.6"/>' +
    '<circle cx="12" cy="12" r="2.3" fill="none" stroke="' + c + '" stroke-width="2"/>' +
    '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="2.6" stroke-linecap="round"/>'
}

const SHAPES = {
  clock: function (c) {
    return '<circle cx="12" cy="12" r="8.5" fill="none" stroke="' + c + '" stroke-width="1.7"/>' +
      '<path d="M12 7.3V12l3.2 2.1" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'
  },
  bell: function (c) {
    return '<path d="M12 3.4a5.5 5.5 0 0 0-5.5 5.5v3.1L4.9 15.5h14.2l-1.6-3.5V8.9A5.5 5.5 0 0 0 12 3.4Z" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linejoin="round"/>' +
      '<path d="M9.9 18.1a2.1 2.1 0 0 0 4.2 0" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round"/>'
  },
  refresh: function (c) {
    return '<path d="M19.4 12a7.4 7.4 0 1 1-2.4-5.4" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round"/>' +
      '<path d="M17.2 2.8v4.2h4.2" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'
  },
  tap: function (c) {
    return '<path d="M8.4 3.2 17.6 12.4l-4.6.6-2.4 4.4z" fill="' + c + '"/>' +
      '<path d="M15.4 15.2c.9 1.1 1.4 2.4 1.4 3.8" fill="none" stroke="' + c + '" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path d="M18.4 13.2c1.6 1.9 2.5 4.1 2.5 6.4" fill="none" stroke="' + c + '" stroke-width="1.6" stroke-linecap="round"/>'
  },
  flame: function (c) {
    return '<path d="M12.7 3c.9 3.1-2.3 4.2-2.3 6.4 0 1.1.8 2 1.8 2 1.5 0 2.4-1.5 2.1-3.2 2.4 1.8 3.8 4.1 3.8 6.5 0 3.4-2.8 6.2-6.2 6.2s-6.2-2.8-6.2-6.2C5.7 10.1 10.3 8 12.7 3Z" fill="' + c + '"/>'
  },
  grid: function (c) {
    return '<rect x="4" y="4" width="6.6" height="6.6" rx="1.9" fill="' + c + '"/>' +
      '<rect x="13.4" y="4" width="6.6" height="6.6" rx="1.9" fill="' + c + '"/>' +
      '<rect x="4" y="13.4" width="6.6" height="6.6" rx="1.9" fill="' + c + '"/>' +
      '<rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1.9" fill="' + c + '"/>'
  },
  user: function (c) {
    return '<circle cx="12" cy="8.4" r="3.6" fill="' + c + '"/>' +
      '<path d="M4.6 20c.7-3.7 3.8-5.7 7.4-5.7s6.7 2 7.4 5.7Z" fill="' + c + '"/>'
  },
  gear: gearShape,
  vip: function (c) {
    return '<path d="M12 3.4 20.6 12 12 20.6 3.4 12Z" fill="' + c + '"/>' +
      '<path d="M12 7.6 16.4 12 12 16.4 7.6 12Z" fill="#ffffff"/>'
  },
  island: function (c) {
    return '<rect x="2.8" y="7.4" width="18.4" height="9.2" rx="4.6" fill="none" stroke="' + c + '" stroke-width="1.7"/>' +
      '<circle cx="16.3" cy="12" r="1.6" fill="' + c + '"/>' +
      '<circle cx="7.6" cy="12" r="1.2" fill="' + c + '" opacity="0.5"/>'
  },
  stopwatch: function (c) {
    return '<circle cx="12" cy="13.6" r="7" fill="none" stroke="' + c + '" stroke-width="1.7"/>' +
      '<path d="M12 9.8v3.9l2.7 1.6" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M9.6 3.3h4.8M12 3.3v3.3" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round"/>' +
      '<path d="M18.6 7.4 20 6" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round"/>'
  },
  source: function (c) {
    return '<path d="M19.6 12a7.6 7.6 0 1 1-2.5-5.6" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round"/>' +
      '<path d="M17.2 2.6v4.2h4.2" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M12 8.6v3.6l2.8 1.7" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'
  },
  display: function (c) {
    return '<circle cx="12" cy="12.4" r="7.6" fill="none" stroke="' + c + '" stroke-width="1.7"/>' +
      '<path d="M12 8.2v4.4l3.3 2" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M9.4 2.8h5.2" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round"/>'
  },
  alarm: function (c) {
    return '<circle cx="12" cy="13.1" r="6.6" fill="none" stroke="' + c + '" stroke-width="1.6"/>' +
      '<path d="M12 9.9v3.4l2.3 1.4" fill="none" stroke="' + c + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M4.3 6.3 6.6 4M19.7 6.3 17.4 4" fill="none" stroke="' + c + '" stroke-width="1.6" stroke-linecap="round"/>'
  },
  goods: function (c) {
    return '<rect x="3.6" y="5.2" width="16.8" height="13.6" rx="2.8" fill="none" stroke="' + c + '" stroke-width="1.8"/>' +
      '<path d="M3.6 9.8h16.8" stroke="' + c + '" stroke-width="1.8"/>' +
      '<path d="M7.4 13.8h6" stroke="' + c + '" stroke-width="1.8" stroke-linecap="round"/>'
  },
  chevronDown: function (c) {
    return '<path d="M6.2 9.6 12 15.2l5.8-5.6" fill="none" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
  },
  chevronUp: function (c) {
    return '<path d="M6.2 14.4 12 8.8l5.8 5.6" fill="none" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
  },
  back: function (c) {
    return '<path d="M14.8 5.6 9.2 12l5.6 6.4" fill="none" stroke="' + c + '" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>'
  },
  chevronRight: function (c) {
    return '<path d="M9.8 5.6 15.4 12l-5.6 6.4" fill="none" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
  },
  checkOn: function (c) {
    return '<circle cx="12" cy="12" r="9" fill="' + c + '"/>' +
      '<path d="M7.8 12.3 10.6 15l5.6-6" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
  },
  checkOff: function (c) {
    return '<circle cx="12" cy="12" r="8.6" fill="none" stroke="' + c + '" stroke-width="1.6"/>'
  },
  close: function (c) {
    return '<path d="M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6" fill="none" stroke="' + c + '" stroke-width="2" stroke-linecap="round"/>'
  },
  plus: function (c) {
    return '<path d="M12 5.4v13.2M5.4 12h13.2" fill="none" stroke="' + c + '" stroke-width="2.1" stroke-linecap="round"/>'
  },
  trash: function (c) {
    return '<path d="M5.6 7.6h12.8M9.4 7.6V5.8h5.2v1.8M7.4 7.6l.9 11h7.4l.9-11" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'
  },
  target: function (c) {
    return '<circle cx="12" cy="12" r="8.4" fill="none" stroke="' + c + '" stroke-width="1.7"/>' +
      '<circle cx="12" cy="12" r="4.2" fill="none" stroke="' + c + '" stroke-width="1.7"/>' +
      '<circle cx="12" cy="12" r="1.6" fill="' + c + '"/>'
  },
  sun: function (c) {
    return '<circle cx="12" cy="12" r="4.2" fill="none" stroke="' + c + '" stroke-width="1.7"/>' +
      '<path d="M12 2.9v2.4M12 18.7v2.4M2.9 12h2.4M18.7 12h2.4M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round"/>'
  },
  globe: function (c) {
    return '<circle cx="12" cy="12" r="8.4" fill="none" stroke="' + c + '" stroke-width="1.7"/>' +
      '<path d="M3.6 12h16.8" fill="none" stroke="' + c + '" stroke-width="1.7"/>' +
      '<path d="M12 3.6c2.3 2.4 3.4 5.3 3.4 8.4s-1.1 6-3.4 8.4c-2.3-2.4-3.4-5.3-3.4-8.4S9.7 6 12 3.6Z" fill="none" stroke="' + c + '" stroke-width="1.7"/>'
  },
  speed: function (c) {
    return '<path d="M4.2 17.4a8.6 8.6 0 1 1 15.6 0Z" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linejoin="round"/>' +
      '<path d="M12 17.4 15.8 10" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round"/>'
  },
  vibrate: function (c) {
    return '<rect x="7.6" y="3.8" width="8.8" height="16.4" rx="2.2" fill="none" stroke="' + c + '" stroke-width="1.7"/>' +
      '<path d="M4.2 9.4v5.2M19.8 9.4v5.2" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round"/>'
  },
  cal: function (c) {
    return '<rect x="3.8" y="5.4" width="16.4" height="14" rx="2.6" fill="none" stroke="' + c + '" stroke-width="1.7"/>' +
      '<path d="M3.8 10h16.4M8.4 3.4v3.6M15.6 3.4v3.6" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round"/>'
  },
  shield: function (c) {
    return '<path d="M12 3.2 19 6v6c0 4.2-2.9 7.4-7 8.8-4.1-1.4-7-4.6-7-8.8V6Z" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linejoin="round"/>' +
      '<path d="M9 12.2 11.2 14.4 15.2 10" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'
  },
  user2: function (c) {
    return '<circle cx="12" cy="8.6" r="3.9" fill="none" stroke="' + c + '" stroke-width="1.7"/>' +
      '<path d="M5 19.6c.8-3.4 3.6-5.2 7-5.2s6.2 1.8 7 5.2" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round"/>'
  }
}

function icon(name, color, size) {
  const shape = SHAPES[name]
  if (!shape) return ''
  const c = color || '#000000'
  const s = size || 48
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + s + '" height="' + s + '">' +
    shape(c) + '</svg>'
  return 'data:image/svg+xml;base64,' + b64(svg)
}

module.exports = { icon: icon, b64: b64, SHAPES: SHAPES }