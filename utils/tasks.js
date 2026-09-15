// 定时点击任务：时间精确到毫秒（HH:MM:SS.mmm），位置设置先预留
const time = require('./time')

const TASKS_KEY = 'fxclock.tasks.v1'

function pad(n, len) {
  let s = String(Math.abs(Math.floor(n)))
  const width = len || 2
  while (s.length < width) s = '0' + s
  return s
}

/** 解析 'HH:MM:SS.mmm' / 'HH:MM:SS' / 'HH:MM' -> { h, m, s, ms }，非法返回 null */
function parseTime(text) {
  const str = String(text || '').trim()
  const m = str.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.(\d{1,3}))?$/)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const mi = parseInt(m[2], 10)
  const s = m[3] === undefined ? 0 : parseInt(m[3], 10)
  let ms = 0
  if (m[4] !== undefined) ms = parseInt((m[4] + '00').slice(0, 3), 10)
  if (h > 23 || mi > 59 || s > 59 || ms > 999) return null
  return { h: h, m: mi, s: s, ms: ms }
}

function formatTime(parts) {
  const p = parts || {}
  return pad(p.h || 0) + ':' + pad(p.m || 0) + ':' + pad(p.s || 0) + '.' + msDigit(p.ms || 0)
}

/** 拆分给列表显示：hms = HH:MM:SS，ms = 三位毫秒 */
function splitTime(text) {
  const p = parseTime(text) || { h: 0, m: 0, s: 0, ms: 0 }
  return {
    hms: pad(p.h) + ':' + pad(p.m) + ':' + pad(p.s),
    ms: String(msDigit(p.ms)),
    parts: p
  }
}

function clampTime(parts) {
  const p = Object.assign({ h: 0, m: 0, s: 0, ms: 0 }, parts)
  if (p.ms > 999) { p.ms -= 1000; p.s += 1 }
  if (p.ms < 0) { p.ms += 1000; p.s -= 1 }
  if (p.s > 59) { p.s -= 60; p.m += 1 }
  if (p.s < 0) { p.s += 60; p.m -= 1 }
  if (p.m > 59) { p.m -= 60; p.h += 1 }
  if (p.m < 0) { p.m += 60; p.h -= 1 }
  if (p.h > 23) p.h -= 24
  if (p.h < 0) p.h += 24
  return p
}


/* ==== 时效判定（纯函数，供悬浮窗「点击」状态圆使用）====
   预览生成器会按下面两条标记原样把这整块内联进网页预览，
   所以块内必须自给自足：不引用本文件其它任何符号。 */
/* NEAR-BEGIN */
const NEAR_WINDOW_MS = 5 * 60 * 1000 // ±5 分钟

/** 'HH:MM:SS.mmm' -> 一天中的毫秒数；非法返回 null */
function hmsToDayMs(text) {
  const m = String(text || '').trim().match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.(\d{1,3}))?$/)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const mi = parseInt(m[2], 10)
  const s = m[3] === undefined ? 0 : parseInt(m[3], 10)
  const ms = m[4] === undefined ? 0 : parseInt((m[4] + '00').slice(0, 3), 10)
  if (h > 23 || mi > 59 || s > 59 || ms > 999) return null
  return ((h * 60 + mi) * 60 + s) * 1000 + ms
}

/**
 * 时钟 parts -> 一天中的毫秒数
 * time.parts() 给的是 { hours, minutes, seconds, ms }
 * tasks.parseTime() 给的是 { h, m, s, ms }
 * 两种都认，免得调用方各写一份换算。
 */
function partsToDayMs(parts) {
  const p = parts || {}
  const pick = (long, short) => (p[long] === undefined ? p[short] || 0 : p[long])
  const h = pick('hours', 'h')
  const m = pick('minutes', 'm')
  const s = pick('seconds', 's')
  return ((h * 60 + m) * 60 + s) * 1000 + (p.ms || 0)
}

/** 环形时差：跨零点（如 23:58 与 00:02）也按近距离算 */
function dayDiff(a, b) {
  const DAY = 86400000
  const d = Math.abs(a - b) % DAY
  return Math.min(d, DAY - d)
}

/**
 * 取一项任务的时间 -> 一天中的毫秒数；取不到返回 null
 * 兼容两种数据形状：
 *   小程序存储   { time: '14:29:05.2', ... }
 *   网页预览内联 { parts: { h, m, s, ms }, ... }
 */
function taskDayMs(item) {
  if (!item) return null
  if (typeof item.time === 'string') {
    const t = hmsToDayMs(item.time)
    if (t !== null) return t
  }
  if (item.parts) return partsToDayMs(item.parts)
  return null
}

/**
 * 扫描定时点击列表：存在与「当前时刻」相差 <= windowMs 的项 → true，否则 false
 * 定时项都是「每天」（repeat=daily），所以只比较一天中的时刻，不看日期。
 * 列表里所有项一律参与判定（页面上已无单项开关，不读 enabled 字段）。
 */
function hasTaskNear(list, parts, windowMs) {
  const win = typeof windowMs === 'number' ? windowMs : NEAR_WINDOW_MS
  const now = partsToDayMs(parts)
  const arr = list || []
  for (let i = 0; i < arr.length; i++) {
    const t = taskDayMs(arr[i])
    if (t === null) continue
    if (dayDiff(t, now) <= win) return true
  }
  return false
}
/* NEAR-END */

function uid() {
  return 'task-' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36)
}

/**
 * 定时点击的预设：固定 6 组（与参考图一致）
 * 首次进入「定时点击」页、以及「我的 → 清除本地数据」之后，列表就是这个状态。
 * 想换预设内容，改这张表即可 —— 条数由 PRESET_TASKS.length 决定。
 */
const PRESET_TASKS = [
  { time: '14:29:05.2', name: 'first', place: { x: 172, y: 308 } },
  { time: '16:26:00.1', name: '闹钟', place: { x: 96, y: 512 } },
  { time: '17:23:00.3', name: '闹钟', place: { x: 280, y: 420 } },
  { time: '20:26:00.4', name: '闹钟', place: { x: 188, y: 700 } },
  { time: '04:26:00.5', name: '闹钟', place: { x: 120, y: 240 } },
  { time: '05:26:00.6', name: '闹钟', place: { x: 260, y: 560 } }
]
const PRESET_COUNT = PRESET_TASKS.length // 6 组

/** 生成一份新的预设列表（每次调用都是新 id，避免跨端串号） */
function defaultTasks() {
  return PRESET_TASKS.slice(0, PRESET_COUNT).map((t, i) => ({
    id: uid(),
    time: t.time,
    name: t.name,
    repeat: 'daily',
    enabled: true, // 单项开关已按需求取消，是否生效统一由首页「开启悬浮窗」决定
    place: { x: t.place.x, y: t.place.y, label: 'X ' + t.place.x + ' · Y ' + t.place.y },
    createdAt: Date.now() + i
  }))
}

function read(key, fallback) {
  try {
    const v = wx.getStorageSync(key)
    if (v === '' || v === null || v === undefined) return fallback
    return v
  } catch (e) {
    return fallback
  }
}

function write(key, value) {
  try {
    wx.setStorageSync(key, value)
  } catch (e) {}
}

function load() {
  const raw = read(TASKS_KEY, null)
  // 只有「存储里根本没有这个键」才播种默认任务；
  // 用户主动删空的 [] 必须原样返回，否则删完又冒出来。
  if (raw === null) {
    const seed = defaultTasks()
    write(TASKS_KEY, seed)
    return seed
  }
  return Array.isArray(raw) ? raw : []
}

function save(list) {
  write(TASKS_KEY, list)
}

function add(task) {
  const list = load()
  const item = Object.assign({
    id: uid(),
    time: '00:00:00.000',
    name: '',
    repeat: 'daily',
    enabled: true,
    place: { x: null, y: null, label: '' },
    createdAt: Date.now()
  }, task)
  list.push(item)
  save(list)
  return item
}

function update(id, patch) {
  const list = load()
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) {
      list[i] = Object.assign({}, list[i], patch)
      save(list)
      return list[i]
    }
  }
  return null
}

function remove(id) {
  const list = load().filter((t) => t.id !== id)
  save(list)
  return list
}

function setEnabled(id, enabled) {
  return update(id, { enabled: !!enabled })
}

function reset() {
  const seed = defaultTasks()
  write(TASKS_KEY, seed)
  return seed
}

// 毫秒档位：1-9（每档 100ms），步进在 1 与 9 之间循环
const MS_MIN = 0
const MS_MAX = 9

function msDigit(ms) {
  const d = Math.round((ms || 0) / 100)
  if (d < 0) return 0
  if (d > MS_MAX) return MS_MAX
  return d
}

/** 毫秒位 0-9 步进；越界时向秒进位 / 借位（与时分秒一致的时钟行为） */
function bumpMs(parts, delta) {
  const p = Object.assign({}, parts || {})
  let d = msDigit(p.ms) + (delta > 0 ? 1 : -1)
  if (d > MS_MAX) {
    d = MS_MIN
    p.s = (p.s || 0) + 1
  } else if (d < MS_MIN) {
    d = MS_MAX
    p.s = (p.s || 0) - 1
  }
  p.ms = d * 100
  return clampTime(p)
}

// 左滑判定（纯函数，便于单测）
const SWIPE_THRESHOLD = 40 // px：横向滑动超过它才算「滑开 / 滑回」
const TAP_SLOP = 8        // px：位移小于它视为点击

function swipeAction(dx, dy, isOpen) {
  if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) return 'tap'
  if (Math.abs(dy) > Math.abs(dx)) return 'none' // 竖向滑动，交给页面滚动
  if (dx < -SWIPE_THRESHOLD) return 'open'
  if (dx > SWIPE_THRESHOLD && isOpen) return 'close'
  return isOpen ? 'open' : 'none'
}

/** 未设置坐标时显示的占位文案（按需求：字面量 NaN，表示「不是数字 / 还没设」）
    注意：这只是显示。是否真的设过坐标由 hasPlace() 决定 ——
    编辑弹层里的坐标标记、清除按钮都看 hasPlace，跟占位文案无关。 */
const PLACE_X_EMPTY = 'X NaN'
const PLACE_Y_EMPTY = 'Y NaN'
const PLACE_EMPTY = 'X NaN · Y NaN'

/** 位置展示：已设置 X 123 / 未设置 X NaN */
function placeX(place) {
  if (!hasPlace(place)) return PLACE_X_EMPTY
  return 'X ' + Math.round(place.x)
}

function placeY(place) {
  if (!hasPlace(place)) return PLACE_Y_EMPTY
  return 'Y ' + Math.round(place.y)
}

function formatPlace(place) {
  if (!hasPlace(place)) return PLACE_EMPTY
  return 'X ' + Math.round(place.x) + ' · Y ' + Math.round(place.y)
}

/**
 * 坐标是否「真的设过」
 * 关键：typeof NaN === 'number'，所以不能只判断类型 ——
 * 一旦某个 NaN 混进来，会被当成有效坐标，界面上直接显示 "X NaN"。
 * 这里要求是有限的数字（挡住 NaN / Infinity / -Infinity / null / 字符串）。
 */
function isCoord(v) {
  return typeof v === 'number' && isFinite(v)
}

function hasPlace(place) {
  return !!(place && isCoord(place.x) && isCoord(place.y))
}

/** 列表渲染用 */
function decorate(task) {
  const sp = splitTime(task.time)
  return Object.assign({}, task, {
    hms: sp.hms,
    ms: sp.ms,
    repeatLabel: task.repeat === 'once' ? '仅一次' : '每天',
    placeLabel: formatPlace(task.place),
    placeX: placeX(task.place),
    placeY: placeY(task.place),
    hasPlace: hasPlace(task.place)
  })
}

module.exports = {
  MS_MIN: MS_MIN,
  MS_MAX: MS_MAX,
  msDigit: msDigit,
  bumpMs: bumpMs,
  swipeAction: swipeAction,
  SWIPE_THRESHOLD: SWIPE_THRESHOLD,
  TASKS_KEY: TASKS_KEY,
  parseTime: parseTime,
  formatTime: formatTime,
  splitTime: splitTime,
  clampTime: clampTime,
  load: load,
  save: save,
  add: add,
  update: update,
  remove: remove,
  setEnabled: setEnabled,
  reset: reset,
  decorate: decorate,
  formatPlace: formatPlace,
  placeX: placeX,
  placeY: placeY,
  isCoord: isCoord,
  PLACE_X_EMPTY: PLACE_X_EMPTY,
  PLACE_Y_EMPTY: PLACE_Y_EMPTY,
  PLACE_EMPTY: PLACE_EMPTY,
  hasPlace: hasPlace,
  defaultTasks: defaultTasks,
  PRESET_TASKS: PRESET_TASKS,
  PRESET_COUNT: PRESET_COUNT,
  pad: pad,
  NEAR_WINDOW_MS: NEAR_WINDOW_MS,
  hmsToDayMs: hmsToDayMs,
  taskDayMs: taskDayMs,
  partsToDayMs: partsToDayMs,
  dayDiff: dayDiff,
  hasTaskNear: hasTaskNear
}