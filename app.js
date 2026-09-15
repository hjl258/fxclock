const store = require('./utils/store')
const sys = require('./utils/sys')

App({
  globalData: {
    statusBarHeight: 20,
    navBarHeight: 44,
    screenWidth: 375,
    pixelRatio: 2,
    capsule: null,
    // 右上角胶囊（···●）占的横向空间：导航行右侧要把这一段留空，
    // 否则页面自己的右上角按钮（「＋ 新建」、帮助）会压在胶囊上
    capsulePad: 108,
    settings: null
  },

  onLaunch() {
    const info = sys.windowInfo()
    const g = this.globalData
    g.statusBarHeight = info.statusBarHeight || 20
    g.screenWidth = info.screenWidth || 375
    g.pixelRatio = info.pixelRatio || 2
    try {
      const rect = wx.getMenuButtonBoundingClientRect()
      if (rect && rect.top) {
        g.capsule = rect
        g.navBarHeight = (rect.top - g.statusBarHeight) * 2 + rect.height
      }
      if (rect && rect.left > 0 && g.screenWidth > rect.left) {
        g.capsulePad = g.screenWidth - rect.left + 8 // 8px 呼吸位
      }
    } catch (e) {
      g.navBarHeight = 44
    }
    g.settings = store.loadSettings()
  },

  setSettings(patch) {
    this.globalData.settings = Object.assign({}, this.globalData.settings, patch)
    store.saveSettings(this.globalData.settings)
    return this.globalData.settings
  },

  getSettings() {
    if (!this.globalData.settings) this.globalData.settings = store.loadSettings()
    return this.globalData.settings
  }
})