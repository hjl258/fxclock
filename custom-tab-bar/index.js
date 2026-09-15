const icons = require('../utils/icons')

Component({
  data: {
    selected: 0,
    // 弹层 / 取点遮罩打开时把它藏起来。
    // 自定义 TabBar 是框架单独渲染的一层，页面里 z-index 再高也压不住它，
    // 所以只能由页面调 getTabBar().setData({ hidden: true }) 主动隐藏。
    hidden: false,
    list: [
      { pagePath: '/pages/clock/clock', text: '时钟', icon: 'clock' },
      { pagePath: '/pages/clicker/clicker', text: '点击', icon: 'tap' },
      { pagePath: '/pages/mine/mine', text: '我的', icon: 'user2' }
    ],
    iconList: []
  },

  lifetimes: {
    attached() {
      this.refresh()
    }
  },

  observers: {
    selected() {
      this.refresh()
    }
  },

  methods: {
    refresh() {
      const selected = this.data.selected
      const iconList = this.data.list.map((item, index) => {
        return icons.icon(item.icon, index === selected ? '#2f6fd0' : '#2c3140', 56)
      })
      this.setData({ iconList: iconList })
    },

    onTap(e) {
      const index = e.currentTarget.dataset.index
      const item = this.data.list[index]
      if (!item) return
      if (index === this.data.selected) return
      wx.switchTab({ url: item.pagePath })
    }
  }
})