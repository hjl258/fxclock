// 时间计算：北京时间 / 本机时间 / 服务器时间（带漂移校准）
const BJ_OFFSET = 8 * 60 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000

const SOURCE_LABEL = {
  beijing: '北京时间',
  device: '本机时间',
  server: '服务器时间'
}

function pad(n, len) {
  let s = String(Math.floor(Math.abs(n)))
  const width = len || 2
  while (s.length < width) s = '0' + s
  return s
}

// 返回目标时区的“挂钟”字段
function parts(epochMs, source, serverOffset) {
  const offset = serverOffset || 0
  let d
  let utc = false
  if (source === 'beijing') {
    d = new Date(epochMs + BJ_OFFSET)
    utc = true
  } else if (source === 'server') {
    d = new Date(epochMs + offset)
  } else {
    d = new Date(epochMs)
  }
  const g = (name) => (utc ? d['getUTC' + name]() : d['get' + name]())
  return {
    year: g('FullYear'),
    month: g('Month') + 1,
    date: g('Date'),
    day: g('Day'),
    hours: g('Hours'),
    minutes: g('Minutes'),
    seconds: g('Seconds'),
    ms: g('Milliseconds')
  }
}

function sourceLabel(source) {
  return SOURCE_LABEL[source] || SOURCE_LABEL.beijing
}

// 走时文本：HH:MM:SS.d（十分位）
function formatClock(p) {
  return pad(p.hours) + ':' + pad(p.minutes) + ':' + pad(p.seconds) + '.' + Math.floor(p.ms / 100)
}

// 倒计时拆分（用于卡片数字块）
function countdownParts(targetTs, epochMs) {
  const remain = Math.max(0, (targetTs || epochMs) - epochMs)
  return {
    h: pad(Math.floor(remain / 3600000) % 100),
    m: pad(Math.floor(remain / 60000) % 60),
    s: pad(Math.floor(remain / 1000) % 60),
    t: String(Math.floor((remain % 1000) / 100)),
    remain
  }
}

function countdownText(targetTs, epochMs) {
  const c = countdownParts(targetTs, epochMs)
  return c.h + ':' + c.m + ':' + c.s
}

// 以北京时间为基准的当日某个时刻的时间戳
function beijingEpochOf(h, m, s, epochMs) {
  const p = parts(epochMs, 'beijing')
  return Date.UTC(p.year, p.month - 1, p.date, h || 0, m || 0, s || 0, 0) - BJ_OFFSET
}

// 下一次北京时间 hh:mm:ss（当天已过则顺延一天）
function nextBeijing(h, m, s, epochMs) {
  const now = epochMs || Date.now()
  let t = beijingEpochOf(h, m, s, now)
  while (t <= now) t += DAY
  return t
}

// 目标日期相对今天的天数描述
function dayOffsetLabel(targetTs, epochMs) {
  const a = parts(epochMs || Date.now(), 'beijing')
  const b = parts(targetTs, 'beijing')
  const da = Date.UTC(a.year, a.month - 1, a.date)
  const db = Date.UTC(b.year, b.month - 1, b.date)
  const diff = Math.round((db - da) / DAY)
  if (diff <= 0) return '今天'
  return diff + '天后'
}

function clockLabel(ts) {
  const p = parts(ts, 'beijing')
  return pad(p.hours) + ':' + pad(p.minutes) + ':' + pad(p.seconds)
}

function dateLabel(ts) {
  const p = parts(ts, 'beijing')
  return p.month + '月' + p.date + '日'
}

function fullLabel(ts) {
  const p = parts(ts, 'beijing')
  return p.year + '-' + pad(p.month) + '-' + pad(p.date) + ' ' + pad(p.hours) + ':' + pad(p.minutes)
}

// 解析 "20:00:00"
function parseHMS(text) {
  const arr = String(text || '20:00:00').split(':').map(function (v) { return parseInt(v, 10) || 0 })
  return { h: arr[0] || 0, m: arr[1] || 0, s: arr[2] || 0 }
}

module.exports = {
  BJ_OFFSET: BJ_OFFSET,
  DAY: DAY,
  pad: pad,
  parts: parts,
  sourceLabel: sourceLabel,
  formatClock: formatClock,
  countdownParts: countdownParts,
  countdownText: countdownText,
  beijingEpochOf: beijingEpochOf,
  nextBeijing: nextBeijing,
  dayOffsetLabel: dayOffsetLabel,
  clockLabel: clockLabel,
  dateLabel: dateLabel,
  fullLabel: fullLabel,
  parseHMS: parseHMS
}