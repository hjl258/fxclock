const app = getApp()
const sources = require('../../utils/sources')
const time = require('../../utils/time')
const icons = require('../../utils/icons')

Page({
  data: {
    floatOn: false,
    floatSource: 'server',
    floatOffset: 0,
    floatLabel: '北京时间',
    statusBarHeight: 20,
    capsulePad: 108,
    navBarHeight: 44,
    icons: {},
    manualText: '+0.000s',
    items: [],
    currentText: '--:--:--.-',
    currentName: '北京时间'
  },

  onLoad() {
    const g = app.globalData
    this.setData({
      statusBarHeight: g.statusBarHeight,
      navBarHeight: g.navBarHeight,
      capsulePad: g.capsulePad,
      icons: {
        back: icons.icon('back', '#2c3140', 44),
        refresh: icons.icon('refresh', '#9aa6bd', 36),
        clock: icons.icon('clock', '#8b93a7', 34)
      }
    })
    this.refresh()
    this.startTimer()
  },

  onShow() {
    this.syncFloat()
    this.refresh()
    this.startTimer()
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

  onHide() {
    this.stopTimer()
  },

  onUnload() {
    this.stopTimer()
  },

  startTimer() {
    this.stopTimer()
    this.timer = setInterval(() => this.refresh(), 100)
  },

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  },

  /* 取某个时间源当前显示文本：设备时间读本机；其余读「本机 + 校准 + 手动微调」 */
  textOf(key, manualMs, now) {
    const offset = sources.offsetMs(key, manualMs)
    const parts = sources.isDevice(key)
      ? time.parts(now, 'device', 0)
      : time.parts(now + offset, 'device', 0)
    return time.formatClock(parts)
  },

  refresh() {
    const settings = app.getSettings()
    const manual = settings.manualOffsetMs || 0
    const now = Date.now()
    const items = sources.list().map((item) => ({
      key: item.key,
      name: item.name,
      color: item.color,
      badge: item.badge,
      active: item.key === settings.source,
      time: this.textOf(item.key, manual, now),
      desc: sources.descOf(item.key, manual)
    }))
    this.setData({
      items: items,
      manualText: sources.signed(manual / 1000) + 's',
      currentText: this.textOf(settings.source, manual, now),
      currentName: sources.name(settings.source)
    })
  },

  goBack() {
    wx.navigateBack()
  },

  showHelp() {
    wx.showModal({
      title: '时间源说明',
      content: '各平台服务器时间与本机时钟存在网络往返延迟，列表里的「已校准」是该时间源相对本机时钟的补偿值。\n\n选择某个时间源后，首页环形时钟与抢购倒计时都会按它计时；也可以用「手动微调」做最后几十毫秒的修正。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  selectSource(e) {
    const key = e.currentTarget.dataset.key
    app.setSettings({ source: key })
    try { wx.vibrateShort({ type: 'light' }) } catch (err) {}
    wx.showToast({ title: '已切换到 ' + sources.name(key), icon: 'none', duration: 1200 })
    this.refresh()
  },

  resync(e) {
    const key = e.currentTarget.dataset.key
    const calib = sources.resync(key)
    if (sources.isDevice(key)) {
      wx.showToast({ title: '设备时间无需校准', icon: 'none', duration: 1200 })
    } else {
      wx.showToast({ title: '已重新校准 ' + sources.name(key), icon: 'none', duration: 1200 })
    }
    this.refresh()
  },

  addSource() {
    wx.showModal({
      title: '添加时间源',
      content: '自定义时间源需要填写服务器时间接口，后续版本支持。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  incManual() {
    this.stepManual(50)
  },

  decManual() {
    this.stepManual(-50)
  },

  stepManual(deltaMs) {
    const settings = app.getSettings()
    const next = Math.max(-2000, Math.min(2000, (settings.manualOffsetMs || 0) + deltaMs))
    app.setSettings({ manualOffsetMs: next })
    this.refresh()
  }
})