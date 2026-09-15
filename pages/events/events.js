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
    pageStyle: '',
    navBarHeight: 44,
    icons: {},
    items: [],
    showAdd: false,
    form: { title: '', price: '', platform: '', tag: '酒类', kind: 'daily', at: '20:00' },
    tags: ['酒类', '数码', '球鞋', '美妆', '门票']
  },

  onLoad() {
    const g = app.globalData
    this.setData({
      statusBarHeight: g.statusBarHeight,
      navBarHeight: g.navBarHeight,
      capsulePad: g.capsulePad,
      icons: {
        back: icons.icon('back', '#2c3140', 44),
        close: icons.icon('close', '#6b7280', 40),
        target: icons.icon('target', '#8b93a7', 34),
        trash: icons.icon('trash', '#c2c8d4', 34)
      }
    })
    this.refresh()
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
    this.timer = setInterval(() => this.refresh(), 200)
  },

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  },

  refresh() {
    const now = Date.now()
    const events = store.loadEvents()
    const activeId = store.activeId()
    const items = events.map((ev) => {
      let targetTs
      if (ev.kind === 'once' && ev.timestamp) {
        targetTs = ev.timestamp
      } else {
        const hms = time.parseHMS(ev.at)
        targetTs = time.nextBeijing(hms.h, hms.m, hms.s, now)
      }
      const cd = time.countdownParts(targetTs, now)
      return {
        id: ev.id,
        title: ev.title,
        price: ev.price,
        tag: ev.tag,
        platform: ev.platform,
        active: ev.id === activeId,
        targetLabel: time.dayOffsetLabel(targetTs, now) + ' ' + time.clockLabel(targetTs),
        cd: { h: cd.h, m: cd.m, s: cd.s, t: cd.t }
      }
    })
    this.setData({ items: items })
  },

  goBack() {
    wx.navigateBack()
  },

  setActive(e) {
    const id = e.currentTarget.dataset.id
    store.setActiveId(id)
    try { wx.vibrateShort({ type: 'light' }) } catch (err) {}
    wx.showToast({ title: '已设为首页卡片', icon: 'none', duration: 1200 })
    // 回到首页即可看到新卡片
    setTimeout(() => wx.navigateBack(), 400)
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除事件',
      content: '删除后该倒计时将不再出现。',
      confirmText: '删除',
      confirmColor: '#e34d3b',
      success: (res) => {
        if (res.confirm) {
          store.removeEvent(id)
          this.refresh()
        }
      }
    })
  },

  openAdd() {
    this.setData({ showAdd: true })
    this.syncOverlay()
  },

  closeAdd() {
    this.setData({ showAdd: false })
    this.syncOverlay()
  },

  // 弹层打开时锁住页面滚动（page-meta），手指在弹层上滑动不会带着列表滚
  syncOverlay() {
    const pageStyle = this.data.showAdd === true ? 'overflow:hidden' : ''
    if (this.data.pageStyle !== pageStyle) this.setData({ pageStyle: pageStyle })
  },

  noop() {},

  onTitleInput(e) {
    this.setData({ 'form.title': e.detail.value })
  },

  onPriceInput(e) {
    this.setData({ 'form.price': e.detail.value })
  },

  onPlatformInput(e) {
    this.setData({ 'form.platform': e.detail.value })
  },

  onTimeChange(e) {
    this.setData({ 'form.at': e.detail.value })
  },

  onKindTap(e) {
    this.setData({ 'form.kind': e.currentTarget.dataset.kind })
  },

  onTagTap(e) {
    this.setData({ 'form.tag': e.currentTarget.dataset.tag })
  },

  submit() {
    const form = this.data.form
    if (!form.title) {
      wx.showToast({ title: '请填写商品标题', icon: 'none' })
      return
    }
    const parts = form.at.split(':')
    const h = parseInt(parts[0], 10) || 0
    const m = parseInt(parts[1], 10) || 0
    const payload = {
      title: form.title,
      price: form.price || '0.00',
      platform: form.platform || '自定义',
      tag: form.tag,
      kind: form.kind,
      at: time.pad(h) + ':' + time.pad(m) + ':00',
      createdAt: Date.now()
    }
    if (form.kind === 'once') {
      payload.timestamp = time.nextBeijing(h, m, 0, Date.now())
    }
    const item = store.addEvent(payload)
    store.setActiveId(item.id)
    this.setData({
      showAdd: false,
      pageStyle: '',
      form: { title: '', price: '', platform: '', tag: '酒类', kind: 'daily', at: '20:00' }
    })
    this.refresh()
    wx.showToast({ title: '已添加并设为首页卡片', icon: 'none', duration: 1400 })
  }
})