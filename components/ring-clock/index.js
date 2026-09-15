const time = require('../../utils/time')
const ringSvg = require('../../utils/ringSvg')

// 环形时钟：毫秒级走时，进度弧 = 当前分钟内已走过的秒数
// 图形（刻度 / 定位点 / 进度弧）全部是 SVG data URI，由 <image> 渲染 —— 不用 canvas，
// 因为 canvas 在部分环境下处于「最上层原生层」，会盖住中央文字与悬浮窗。
Component({
  properties: {
    source: { type: String, value: 'beijing' },
    serverOffset: { type: Number, value: 0 },
    badgeIcon: { type: String, value: '' },
    label: { type: String, value: '' },
    size: { type: Number, value: 500 }
  },

  data: {
    timeText: '--:--:--.-',
    subText: '北京时间',
    ticksSvg: '',
    arcSvg: ''
  },

  lifetimes: {
    ready() {
      this._alive = true
      // 刻度与定位点是静态的，只算一次（比较贵）
      if (!this.data.ticksSvg) this.setData({ ticksSvg: ringSvg.ticksSvg() })
      this.start()
    },
    detached() {
      this.stop()
    }
  },

  methods: {
    start() {
      if (this._timer) return
      this.paint()
      // 50ms 一档：弧每步约 0.3°，肉眼看是连续的
      this._timer = setInterval(() => this.paint(), 50)
    },

    stop() {
      if (this._timer) {
        clearInterval(this._timer)
        this._timer = null
      }
    },

    pause() {
      this.stop()
    },

    resume() {
      this._alive = true
      this.start()
    },

    paint() {
      if (!this._alive) return
      const p = time.parts(Date.now(), this.data.source, this.data.serverOffset)
      const progress = (p.seconds + p.ms / 1000) / 60
      const text = time.formatClock(p)
      const sub = this.data.label || time.sourceLabel(this.data.source)
      const patch = {}

      // 进度弧：字符串没变就不 setData（省一半渲染）
      const arc = ringSvg.arcSvg(progress)
      if (arc !== this._lastArc) {
        this._lastArc = arc
        patch.arcSvg = arc
      }
      if (text !== this._lastText || sub !== this._lastSub) {
        this._lastText = text
        this._lastSub = sub
        patch.timeText = text
        patch.subText = sub
        this.triggerEvent('tick', { text: text, sub: sub })
      }
      if (Object.keys(patch).length) this.setData(patch)
    }
  }
})
