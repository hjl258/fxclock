const app = getApp()
const store = require('../../utils/store')
const time = require('../../utils/time')
const icons = require('../../utils/icons')
const sources = require('../../utils/sources')

Page({
  data: {
    statusBarHeight: 20,
    capsulePad: 108,
    navBarHeight: 44,
    icons: {},
    settings: store.DEFAULT_SETTINGS,
    sourceLabel: '北京时间',
    serverOffset: 0,
    ringSource: 'server',
    event: { title: '', price: '', platform: '' },
    cd: { h: '00', m: '00', s: '00', t: '0' },
    cdLabel: '倒计时',
    targetLabel: '--',
    cardState: 'card-normal',
    clockText: '--:--:--.-',
    expanded: false,
    floatOn: false,
  },

  onLoad() {
    const g = app.globalData
    const settings = app.getSettings()
    this.targetTs = 0
    this.reached = false
    this.setData({
      statusBarHeight: g.statusBarHeight,
      navBarHeight: g.navBarHeight,
      capsulePad: g.capsulePad,
      settings: settings,
      sourceLabel: time.sourceLabel(settings.source),
      icons: this.buildIcons()
    })
    this.syncSource()
    this.resolveEvent()
    this.tick()
    this.startTimer()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    const settings = app.getSettings()
    this.syncSource()
    const ring = this.selectComponent('#ring')
    if (ring) ring.resume()
    this.resolveEvent()
    this.startTimer()
    this.tick()
    this.applyKeepScreenOn()
  },

  onHide() {
    this.stopTimer()
    const ring = this.selectComponent('#ring')
    if (ring) ring.pause()
  },

  onUnload() {
    this.stopTimer()
  },

  /* ---------- 图标 ---------- */
  buildIcons() {
    return {
      flame: icons.icon('flame', '#4aa8f0', 40),
      goods: icons.icon('goods', '#ffffff', 32),
      source: icons.icon('source', '#4a5570', 48),
      alarm: icons.icon('alarm', '#8f95c6', 54),
      chevronUp: icons.icon('chevronUp', '#7c8497', 38),
      chevronDown: icons.icon('chevronDown', '#7c8497', 38),
      chevronRight: icons.icon('chevronRight', '#b7bdc9', 30),
      close: icons.icon('close', '#6b7280', 40),
      checkOn: icons.icon('checkOn', '#2f6fd0', 42),
      checkOff: icons.icon('checkOff', '#c9cfdb', 42)
    }
  },

  /* ---------- 抢购事件 ---------- */
  resolveEvent() {
    const event = store.activeEvent()
    if (!event) return
    const now = Date.now()
    let targetTs
    if (event.kind === 'once' && event.timestamp) {
      targetTs = event.timestamp
    } else {
      const hms = time.parseHMS(event.at)
      targetTs = time.nextBeijing(hms.h, hms.m, hms.s, now)
    }
    this.targetTs = targetTs
    this.reached = false
    this.setData({
      event: event,
      targetLabel: time.dayOffsetLabel(targetTs, now) + ' ' + time.clockLabel(targetTs),
      cdLabel: event.kind === 'once' && targetTs <= now ? '已结束' : '倒计时',
      cardState: event.kind === 'once' && targetTs <= now ? 'card-done' : 'card-normal'
    })
  },

  /* ---------- 计时 ---------- */
  startTimer() {
    this.stopTimer()
    this.timer = setInterval(() => this.tick(), 100)
  },

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  },

  tick() {
    const now = Date.now()
    const target = this.targetTs || now
    const cd = time.countdownParts(target, now)
    const patch = {}
    if (
      cd.h !== this.data.cd.h ||
      cd.m !== this.data.cd.m ||
      cd.s !== this.data.cd.s ||
      cd.t !== this.data.cd.t
    ) {
      patch.cd = { h: cd.h, m: cd.m, s: cd.s, t: cd.t }
    }
    if (Object.keys(patch).length) this.setData(patch)
    if (cd.remain <= 0 && !this.reached) this.onReached()
  },

  onReached() {
    this.reached = true
    const settings = this.data.settings
    if (settings.haptic) {
      try { wx.vibrateShort({ type: 'heavy' }) } catch (e) {}
    }
    try {
      wx.showToast({ title: '开始抢购', icon: 'none', duration: 2000 })
    } catch (e) {}
    const event = this.data.event
    if (event && event.kind === 'once') {
      this.setData({ cdLabel: '已结束', cardState: 'card-done' })
    } else {
      this.setData({ cdLabel: '开抢中', cardState: 'card-live' })
      setTimeout(() => {
        this.resolveEvent()
      }, 4000)
    }
  },

  // 环形时钟每帧计算结果：主时间来自组件，这里只同步悬浮窗文字
  onRingTick(e) {
    const detail = e.detail || {}
    if (detail.text && detail.text !== this.data.clockText) {
      this.setData({ clockText: detail.text })
    }
  },

  /* ---------- 设置 ---------- */



  // 时间源：跳独立页面（手动微调 / 多源选择 / 校准）
  openTimeSource() {
    wx.navigateTo({ url: '/pages/timeSource/timeSource' })
  },

  // 把当前时间源同步到环形时钟与入口文案
  syncSource() {
    const settings = app.getSettings()
    const key = settings.source || sources.DEFAULT_KEY
    this.setData({
      settings: settings,
      sourceLabel: sources.name(key),
      ringSource: sources.clockSource(key),
      serverOffset: sources.clockOffset(key, settings.manualOffsetMs || 0),
      floatOn: settings.floatOn === true
    })
  },

  toggleExpand() {
    this.setData({ expanded: !this.data.expanded })
  },


  onHapticChange(e) {
    const settings = app.setSettings({ haptic: e.detail.value })
    this.setData({ settings: settings })
  },


  onKeepScreenChange(e) {
    const settings = app.setSettings({ keepScreenOn: e.detail.value })
    this.setData({ settings: settings })
    this.applyKeepScreenOn()
  },

  setFps(e) {
    const fps = Number(e.currentTarget.dataset.fps)
    const settings = app.setSettings({ fps: fps })
    this.setData({ settings: settings })
  },

  /* ---------- 悬浮窗 ---------- */
  toggleFloat() {
    const floatOn = !this.data.floatOn
    app.setSettings({ floatOn: floatOn })
    this.setData({ floatOn: floatOn, settings: app.getSettings() })
    this.applyKeepScreenOn()
    if (floatOn) {
      try { wx.vibrateShort({ type: 'light' }) } catch (e) {}
    }
  },


  applyKeepScreenOn() {
    const settings = this.data.settings || {}
    const on = this.data.floatOn && settings.keepScreenOn !== false
    try { wx.setKeepScreenOn({ keepScreenOn: !!on }) } catch (e) {}
  },

  openEvents() {
    wx.navigateTo({ url: '/pages/events/events' })
  },

  onShareAppMessage() {
    return {
      title: '悬浮时钟 · 毫秒级抢购倒计时',
      path: '/pages/clock/clock'
    }
  }
})