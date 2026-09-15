const app = getApp()
const sources = require('../../utils/sources')
const store = require('../../utils/store')
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
    settings: store.DEFAULT_SETTINGS,
    sourceLabel: '北京时间',
    version: '1.0.0'
  },

  onLoad() {
    const g = app.globalData
    this.setData({
      statusBarHeight: g.statusBarHeight,
      navBarHeight: g.navBarHeight,
      capsulePad: g.capsulePad,
      icons: {
        user: icons.icon('user2', '#ffffff', 56),
        vibrate: icons.icon('vibrate', '#4a5570', 40),
        shield: icons.icon('shield', '#4a5570', 40),
        cal: icons.icon('cal', '#4a5570', 40),
        chevron: icons.icon('chevronRight', '#b7bdc9', 30)
      }
    })
    this.sync()
  },

  onShow() {
    this.syncFloat()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.sync()
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

  sync() {
    const settings = app.getSettings()
    this.setData({
      settings: settings,
      sourceLabel: sources.name(settings.source)
    })
  },

  onHaptic(e) {
    app.setSettings({ haptic: e.detail.value })
    this.sync()
  },


  onKeep(e) {
    app.setSettings({ keepScreenOn: e.detail.value })
    try { wx.setKeepScreenOn({ keepScreenOn: !!e.detail.value }) } catch (err) {}
    this.sync()
  },

  about() {
    wx.showModal({
      title: '关于悬浮时钟',
      content: '版本 ' + this.data.version + '\n毫秒级走时 · 北京时间授时 · 抢购倒计时提醒。\n小程序内的「悬浮窗」为页内悬浮层，无法覆盖到其它 App 之上。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  resetAll() {
    wx.showModal({
      title: '清除本地数据',
      content: '将恢复默认设置。',
      confirmText: '清除',
      confirmColor: '#e34d3b',
      success: (res) => {
        if (res.confirm) {
          store.resetAll()
          this.sync()
          wx.showToast({ title: '已清除', icon: 'none' })
        }
      }
    })
  }
})