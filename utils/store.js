// 设置与抢购事件本地存储
const tasks = require('./tasks')
const SETTINGS_KEY = 'fxclock.settings.v1'
const EVENTS_KEY = 'fxclock.events.v1'
const ACTIVE_KEY = 'fxclock.active.v1'
const FLOAT_POS_KEY = 'fxclock.floatPos.v1'

const DEFAULT_SETTINGS = {
  source: 'beijing',
  manualOffsetMs: 0,
  haptic: true,
  keepScreenOn: true,
  floatOn: false,
  fps: 60
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

function defaultEvents() {
  const now = Date.now()
  return [
    {
      id: 'evt-maotai',
      title: '【淘宝】茅台（MOUTAI）飞天 53%vol 500ml 贵州茅台酒',
      price: '1499.00',
      platform: '淘宝',
      tag: '酒类',
      kind: 'daily',
      at: '20:00:00',
      createdAt: now - 6 * 60 * 1000
    },
    {
      id: 'evt-iphone',
      title: '【京东】Apple iPhone 17 Pro Max 256GB 沙漠色钛金属',
      price: '9999.00',
      platform: '京东',
      tag: '数码',
      kind: 'daily',
      at: '10:00:00',
      createdAt: now
    }
  ]
}

function loadSettings() {
  const saved = read(SETTINGS_KEY, null)
  const merged = Object.assign({}, DEFAULT_SETTINGS, saved || {})
  // 兼容旧版本遗留字段（displayMode / island 等已移除）
  return {
    source: merged.source,
    manualOffsetMs: merged.manualOffsetMs || 0,
    haptic: merged.haptic,
    keepScreenOn: merged.keepScreenOn,
    floatOn: merged.floatOn === true,
    fps: merged.fps
  }
}

function saveSettings(settings) {
  write(SETTINGS_KEY, settings)
}

function saveEvents(list) {
  write(EVENTS_KEY, list)
}

function loadEvents() {
  const list = read(EVENTS_KEY, null)
  if (!list || !list.length) {
    const seed = defaultEvents()
    write(EVENTS_KEY, seed)
    return seed
  }
  return list
}

function uid(prefix) {
  return (prefix || 'evt') + '-' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36)
}

function addEvent(ev) {
  const list = loadEvents()
  const item = Object.assign({ id: uid('evt'), kind: 'daily', at: '20:00:00', createdAt: Date.now() }, ev)
  list.unshift(item)
  saveEvents(list)
  return item
}

function removeEvent(id) {
  const list = loadEvents().filter(function (e) { return e.id !== id })
  saveEvents(list)
  return list
}

function activeId() {
  const list = loadEvents()
  return read(ACTIVE_KEY, list[0] ? list[0].id : '')
}

function setActiveId(id) {
  write(ACTIVE_KEY, id)
}


function activeEvent() {
  const list = loadEvents()
  const id = read(ACTIVE_KEY, list[0] ? list[0].id : '')
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i]
  }
  return list[0] || null
}

// 悬浮窗位置（跨页面共享，独立于设置）
function loadFloatPos() {
  const pos = read(FLOAT_POS_KEY, null)
  if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return null
  return pos
}

function saveFloatPos(pos) {
  write(FLOAT_POS_KEY, { x: Math.round(pos.x), y: Math.round(pos.y) })
}

function resetAll() {
  write(EVENTS_KEY, defaultEvents())
  write(SETTINGS_KEY, DEFAULT_SETTINGS)
  write(ACTIVE_KEY, 'evt-maotai')
  tasks.reset() // 定时点击也回到 6 组预设（原来漏了这一步，清完还留着旧任务）
}

module.exports = {
  DEFAULT_SETTINGS: DEFAULT_SETTINGS,
  loadSettings: loadSettings,
  saveSettings: saveSettings,
  loadEvents: loadEvents,
  saveEvents: saveEvents,
  addEvent: addEvent,
  removeEvent: removeEvent,
  activeId: activeId,
  setActiveId: setActiveId,
  activeEvent: activeEvent,
  loadFloatPos: loadFloatPos,
  saveFloatPos: saveFloatPos,
  resetAll: resetAll
}