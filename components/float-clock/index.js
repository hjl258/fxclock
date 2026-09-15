const sys = require('../../utils/sys')
const time = require('../../utils/time')
const store = require('../../utils/store')
const tasks = require('../../utils/tasks')

// 悬浮窗胶囊：深色卡片，两种状态
//   mode=ruler：开抢倒计时（最后 3 秒刻度尺）
//   mode=perf ：性能监控（刷新率 + 上下行网速）
// 自己处理触摸：拖动 = 移动位置（夹在屏幕内），轻点 = 切换状态
Component({
  properties: {
    show: { type: Boolean, value: false },
    source: { type: String, value: 'server' },
    serverOffset: { type: Number, value: 0 },
    label: { type: String, value: '北京时间' },
    widthRpx: { type: Number, value: 440 },
    heightRpx: { type: Number, value: 236 }
  },

  data: {
    x: 40,
    y: 150,
    w: 220,
    h: 118,
    timeMain: '--:--:--.',
    timeTenth: '-',
    latencyText: '40ms',
    rulerLabels: ['2.5', '2.0', '1.5', '1.0', '0.5'],
    rulerVisible: false,
    sweepPercent: 0,
    hzText: '60Hz',
    upText: '11',
    downText: '0',
    // 「点击」状态圆：定时列表里存在距当前时刻 ±5 分钟的项 → true（绿），否则 false（红）
    nearOn: false
  },

  observers: {
    show: function (val) {
      if (val) this.startClock()
      else this.stopClock()
    }
  },

  lifetimes: {
    attached() {
      this.resetPosition()
      this.startFps()
      this.startNet()
      if (this.data.show) this.startClock()
    },
    detached() {
      this.stopClock()
      this.stopTimers()
    }
  },

  methods: {
    resetPosition() {
      const info = sys.windowInfo()
      const screenW = info.screenWidth || 375
      const screenH = info.windowHeight || 667
      const w = sys.rpx2px(this.data.widthRpx, screenW)
      const h = sys.rpx2px(this.data.heightRpx, screenW)
      const saved = store.loadFloatPos()
      const pos = this.clamp(
        saved ? saved.x : screenW / 2 - w / 2,
        saved ? saved.y : screenH * 0.16,
        w, h, screenW, screenH
      )
      this.setData({ w: w, h: h, x: pos.x, y: pos.y })
    },

    clamp(x, y, w, h, screenW, screenH) {
      const margin = 8
      const topSafe = 44
      const maxX = Math.max(margin, screenW - w - margin)
      const maxY = Math.max(topSafe, screenH - h - margin)
      return {
        x: Math.min(maxX, Math.max(margin, x)),
        y: Math.min(maxY, Math.max(topSafe, y))
      }
    },

    onDragStart(e) {
      const t = e.touches && e.touches[0]
      if (!t) return
      this._drag = { px: t.pageX, py: t.pageY, ox: this.data.x, oy: this.data.y, at: Date.now() }
    },

    onDragMove(e) {
      if (!this._drag) return
      const t = e.touches && e.touches[0]
      if (!t) return
      const info = sys.windowInfo()
      const screenW = info.screenWidth || 375
      const screenH = info.windowHeight || 667
      const nx = this._drag.ox + (t.pageX - this._drag.px)
      const ny = this._drag.oy + (t.pageY - this._drag.py)
      const pos = this.clamp(nx, ny, this.data.w, this.data.h, screenW, screenH)
      this.setData({ x: pos.x, y: pos.y })
    },

    onDragEnd() {
      this._drag = null
      store.saveFloatPos({ x: this.data.x, y: this.data.y })
    },

    // 悬浮窗自己取时间：任意页面挂载都能走，不依赖时钟页
    startClock() {
      if (this._clockTimer) return
      this.paint()
      this._clockTimer = setInterval(() => this.paint(), 100)
    },

    stopClock() {
      if (this._clockTimer) {
        clearInterval(this._clockTimer)
        this._clockTimer = null
      }
    },

    paint() {
      const p = time.parts(Date.now(), this.data.source, this.data.serverOffset)
      const text = time.formatClock(p)
      const main = text.slice(0, text.length - 1)
      const tenth = text.slice(text.length - 1)

      // 刻度尺：只在每分钟最后 2.5 秒出现，游标随秒数走动（0% -> 100%）
      const secOfMinute = p.seconds + p.ms / 1000
      const visible = secOfMinute >= 57.5
      const percent = visible
        ? Math.round(((secOfMinute - 57.5) / 2.5) * 1000) / 10
        : 0

      const latency = this.latencyOf(this.data.label)
      const near = this.taskNear(p)
      const patch = {}
      if (main !== this.data.timeMain) patch.timeMain = main
      if (tenth !== this.data.timeTenth) patch.timeTenth = tenth
      if (visible !== this.data.rulerVisible) patch.rulerVisible = visible
      if (percent !== this.data.sweepPercent) patch.sweepPercent = percent
      if (latency !== this.data.latencyText) patch.latencyText = latency
      if (near !== this.data.nearOn) patch.nearOn = near
      if (Object.keys(patch).length) this.setData(patch)
    },


    // 「点击」状态圆：扫描定时点击列表，命中 ±5 分钟内的项就亮绿
    //   列表随时可能被改（新建 / 删除 / 改时间），所以最多每 2 秒重读一次存储，
    //   每帧只做一次 O(n) 比较（n = 任务条数，通常个位数）。
    taskNear(parts) {
      const now = Date.now()
      if (!this._taskCache || now - this._taskCacheAt > 2000) {
        try {
          this._taskCache = tasks.load()
        } catch (e) {
          this._taskCache = []
        }
        this._taskCacheAt = now
      }
      return tasks.hasTaskNear(this._taskCache, parts, tasks.NEAR_WINDOW_MS)
    },

    // 时间源延迟：按名称取稳定值（真机可换成真实测量）
    latencyOf(name) {
      let h = 0
      const s = String(name || '')
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 97
      return (32 + (h % 14)) + 'ms'
    },

    startFps() {
      try {
        if (!wx.createOffscreenCanvas) return
        const canvas = wx.createOffscreenCanvas({ type: '2d', width: 1, height: 1 })
        if (!canvas || !canvas.requestAnimationFrame) return
        let frames = 0
        this._alive = true
        const loop = () => {
          frames++
          if (this._alive) this._fpsRaf = canvas.requestAnimationFrame(loop)
        }
        this._fpsRaf = canvas.requestAnimationFrame(loop)
        this._fpsTimer = setInterval(() => {
          const hz = Math.max(30, Math.min(144, frames))
          this.setData({ hzText: hz + 'Hz' })
          frames = 0
        }, 1000)
      } catch (e) {
        // 取不到离屏画布则保持默认 60Hz
      }
    },

    startNet() {
      this._up = 11
      this._down = 0
      this._netTimer = setInterval(() => {
        const walk = (v, cap, range) => {
          const next = v + (Math.random() - 0.45) * range
          return Math.max(0, Math.min(cap, Math.round(next)))
        }
        this._up = walk(this._up, 26, 6)
        this._down = walk(this._down, 12, 4)
        this.setData({ upText: String(this._up), downText: String(this._down) })
      }, 1000)
    },

    stopTimers() {
      this._alive = false
      if (this._fpsTimer) { clearInterval(this._fpsTimer); this._fpsTimer = null }
      if (this._netTimer) { clearInterval(this._netTimer); this._netTimer = null }
    }
  }
})