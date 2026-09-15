const app = getApp()
const icons = require('../../utils/icons')
const sources = require('../../utils/sources')
const tasks = require('../../utils/tasks')
const sys = require('../../utils/sys')

// 有限数字才算有效坐标（挡住 NaN）
function isFiniteNum(v) {
  return typeof v === 'number' && isFinite(v)
}

Page({
  data: {
    statusBarHeight: 20,
    capsulePad: 108,
    pageStyle: '',
    navBarHeight: 44,
    icons: {},
    floatOn: false,
    floatSource: 'server',
    floatOffset: 0,
    floatLabel: '北京时间',
    list: [],
    swipeId: '',
    editing: false,
    units: [],
    pickMode: false,
    hasPlace: false,
    markerX: 50,
    markerY: 50,
    screenText: '',
    placeText: 'X NaN · Y NaN',
    form: { id: '', name: '', repeat: 'daily', place: { x: null, y: null } },
    parts: { h: 0, m: 0, s: 0, ms: 0 }
  },

  onLoad() {
    const g = app.globalData
    this.setData({
      statusBarHeight: g.statusBarHeight,
      navBarHeight: g.navBarHeight,
      capsulePad: g.capsulePad,
      screenText: (g.screenWidth || 375) + ' × ' + (this.screenH() || 667),
      icons: {
        close: icons.icon('close', '#6b7280', 40),
        plus: icons.icon('plus', '#ffffff', 40),
        target: icons.icon('target', '#8b93a7', 36)
      }
    })
    this.refresh()
  },

  onShow() {
    this.syncFloat()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    this.syncOverlay()
    this.refresh()
  },

  // 弹层 / 取点遮罩打开时：
  //   1) 隐藏自定义 TabBar —— 它由框架单独渲染，页面里 z-index 再高也压不住；
  //   2) 用 page-meta 把页面滚动锁住 —— 手指在弹层/遮罩上滑动不会带着列表滚，
  //      而且不像 catchtouchmove 那样会连弹层内部的 scroll-view 一起按住。
  syncOverlay() {
    const open = this.data.editing === true || this.data.pickMode === true
    const pageStyle = open ? 'overflow:hidden' : ''
    if (this.data.pageStyle !== pageStyle) this.setData({ pageStyle: pageStyle })
    if (typeof this.getTabBar !== 'function') return
    const bar = this.getTabBar()
    if (!bar) return
    if (bar.data.hidden !== open) bar.setData({ hidden: open })
  },

  // 悬浮窗：跨页面共享开关与时间源
  syncFloat() {
    const settings = app.getSettings()
    const key = settings.source || sources.DEFAULT_KEY
    this.setData({
      floatOn: settings.floatOn === true,
      floatSource: sources.clockSource(key),
      floatOffset: sources.clockOffset(key, settings.manualOffsetMs || 0),
      floatLabel: sources.name(key)
    })
  },


  refresh() {
    this.setData({ list: tasks.load().map(tasks.decorate) })
  },

  /* ---------- 左滑删除 ---------- */

  onRowTouchStart(e) {
    const t = e.touches && e.touches[0]
    if (!t) return
    this._swipe = { x: t.pageX, y: t.pageY, id: e.currentTarget.dataset.id, open: this.data.swipeId === e.currentTarget.dataset.id }
  },

  onRowTouchEnd(e) {
    const s = this._swipe
    this._swipe = null
    if (!s) return
    const t = (e.changedTouches && e.changedTouches[0]) || null
    if (!t) return
    const action = tasks.swipeAction(t.pageX - s.x, t.pageY - s.y, s.open)
    if (action === 'open') {
      this.setData({ swipeId: s.id })
      try { wx.vibrateShort({ type: 'light' }) } catch (err) {}
    } else if (action === 'close') {
      this.setData({ swipeId: '' })
    } else if (action === 'tap') {
      // 已滑开时，点一下先收起；否则打开编辑
      if (s.open) this.setData({ swipeId: '' })
      else this.openEditById(s.id)
    }
  },

  onRowTouchCancel() {
    this._swipe = null
  },

  // 删除（左滑露出的按钮）
  removeTaskById(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除任务',
      content: '删除后该定时点击不再生效。',
      confirmText: '删除',
      confirmColor: '#e34d3b',
      success: (res) => {
        if (res.confirm) {
          tasks.remove(id)
          this.setData({ swipeId: '' })
          this.refresh()
          wx.showToast({ title: '已删除', icon: 'none', duration: 1000 })
        }
      }
    })
  },

  /* ---------- 列表交互 ---------- */


  noop() {},

  /* ---------- 编辑弹层 ---------- */

  openAdd() {
    const now = new Date()
    const text = tasks.formatTime({
      h: now.getHours(),
      m: now.getMinutes(),
      s: now.getSeconds(),
      ms: now.getMilliseconds()
    })
    this.setData({
      editing: true,
      form: { id: '', name: '', repeat: 'daily', place: { x: null, y: null } },
      parts: tasks.parseTime(text)
    })
    this.syncUnits()
    this.applyPlace({ x: null, y: null }) // 新建：位置回到默认 X 0 · Y 0
    this.syncOverlay()
  },

  openEditById(id) {
    const task = tasks.load().filter((t) => t.id === id)[0]
    if (!task) return
    this.setData({
      editing: true,
      form: {
        id: task.id,
        name: task.name,
        repeat: task.repeat || 'daily',
        place: tasks.hasPlace(task.place) ? { x: task.place.x, y: task.place.y } : { x: null, y: null }
      },
      parts: tasks.parseTime(task.time)
    })
    this.syncUnits()
    this.applyPlace(this.data.form.place) // 按被编辑项重置位置区（未设 → X 0 · Y 0）
    this.measurePanel()
    this.syncOverlay()
  },

  closeEdit() {
    this.setData({ editing: false })
    this.syncOverlay()
  },

  syncUnits() {
    const p = this.data.parts
    this.setData({
      units: [
        { key: 'h', label: '时', value: tasks.pad(p.h) },
        { key: 'm', label: '分', value: tasks.pad(p.m) },
        { key: 's', label: '秒', value: tasks.pad(p.s) },
        { key: 'ms', label: '毫秒', value: String(tasks.msDigit(p.ms)) }
      ]
    })
  },

  stepUnit(e) {
    const key = e.currentTarget.dataset.key
    const delta = Number(e.currentTarget.dataset.delta)
    // 毫秒位 0-9，越界时进位 / 借位到秒
    if (key === 'ms') {
      const parts = tasks.bumpMs(this.data.parts, delta)
      this.setData({ parts: parts })
      this.syncUnits()
      return
    }
    const parts = Object.assign({}, this.data.parts)
    parts[key] = (parts[key] || 0) + delta
    const next = tasks.clampTime(parts)
    this.setData({ parts: next })
    this.syncUnits()
  },


  onNameInput(e) {
    this.setData({ 'form.name': e.detail.value })
  },

  setRepeat(e) {
    this.setData({ 'form.repeat': e.currentTarget.dataset.repeat })
  },

  /* ---------- 位置：坐标系取点 ---------- */

  screenH() {
    return sys.windowInfo().windowHeight || 667
  },

  // 面板尺寸（用于把面板内的点换算成屏幕坐标）
  measurePanel() {
    const query = wx.createSelectorQuery()
    query.select('.coord-panel').boundingClientRect()
    query.exec((res) => {
      if (res && res[0]) this._panelRect = res[0]
    })
  },

  applyPlace(place) {
    const info = sys.windowInfo()
    const w = info.windowWidth || 375
    const h = this.screenH()
    const ok = tasks.hasPlace(place)
    this.setData({
      form: Object.assign({}, this.data.form, { place: place }),
      hasPlace: ok,
      placeText: tasks.formatPlace(place),
      markerX: ok ? Math.max(0, Math.min(100, (place.x / w) * 100)) : 50,
      markerY: ok ? Math.max(0, Math.min(100, (place.y / h) * 100)) : 50
    })
  },

  // 点坐标系面板：面板内的相对位置按屏幕尺寸等比换算
  onPanelTap(e) {
    const info = sys.windowInfo()
    const w = info.windowWidth || 375
    const h = this.screenH()
    const rect = this._panelRect
    const d = e.detail || {}
    let x = d.x
    let y = d.y
    // 面板宽高为 0（还没排版）时不能除 —— 除零会算出 NaN / Infinity，
    // 那种值一旦进表单，界面上就会印出 X NaN
    if (rect && rect.width > 0 && rect.height > 0 && isFiniteNum(d.x) && isFiniteNum(d.y)) {
      x = ((d.x - rect.left) / rect.width) * w
      y = ((d.y - rect.top) / rect.height) * h
    } else if (!isFiniteNum(x) || !isFiniteNum(y)) {
      return
    }
    if (!isFiniteNum(x) || !isFiniteNum(y)) return // NaN/undefined 一律忽略，别写进表单
    this.applyPlace({
      x: Math.max(0, Math.min(w, Math.round(x))),
      y: Math.max(0, Math.min(h, Math.round(y)))
    })
    try { wx.vibrateShort({ type: 'light' }) } catch (err) {}
  },

  // 全屏取点：点一下屏幕记录坐标
  enterPick() {
    this.measurePanel()
    this.setData({ pickMode: true })
    this.syncOverlay()
  },

  exitPick() {
    this.setData({ pickMode: false })
    this.syncOverlay()
  },

  onPick(e) {
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
    const info = sys.windowInfo()
    const w = info.windowWidth || 375
    const h = this.screenH()
    if (!t || !isFiniteNum(t.pageX) || !isFiniteNum(t.pageY)) {
      this.setData({ pickMode: false }) // 拿不到坐标也要退出取点模式，别卡在遮罩里
      this.syncOverlay()
      return
    }
    this.applyPlace({
      x: Math.max(0, Math.min(w, Math.round(t.pageX))),
      y: Math.max(0, Math.min(h, Math.round(t.pageY)))
    })
    this.setData({ pickMode: false })
    try { wx.vibrateShort({ type: 'light' }) } catch (err) {}
    wx.showToast({ title: '已记录位置', icon: 'none', duration: 1000 })
  },

  clearPlace() {
    this.applyPlace({ x: null, y: null })
  },

  save() {
    const form = this.data.form
    const parsed = tasks.clampTime(this.data.parts)
    const place = tasks.hasPlace(form.place) ? { x: form.place.x, y: form.place.y, label: tasks.formatPlace(form.place) } : { x: null, y: null, label: '' }
    const payload = {
      time: tasks.formatTime(parsed),
      name: form.name || '点击',
      repeat: form.repeat,
      place: place
    }
    if (form.id) {
      tasks.update(form.id, payload)
    } else {
      tasks.add(payload)
    }
    this.setData({ editing: false })
    this.syncOverlay()
    this.refresh()
    wx.showToast({ title: '已保存', icon: 'none', duration: 1200 })
  },

  removeTask() {
    const id = this.data.form.id
    if (!id) return
    wx.showModal({
      title: '删除任务',
      content: '删除后该定时点击不再生效。',
      confirmText: '删除',
      confirmColor: '#e34d3b',
      success: (res) => {
        if (res.confirm) {
          tasks.remove(id)
          this.setData({ editing: false })
          this.syncOverlay()
          this.refresh()
        }
      }
    })
  }
})