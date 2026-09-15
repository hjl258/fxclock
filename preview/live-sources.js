// 时间源页（现场预览用）：手动微调、多源卡片、校准、返回
// 由 build-live.js 注入到预览脚本中
function initSourcesPreview(ctx) {
  var el = ctx.el
  var q = ctx.q
  var qa = ctx.qa
  var time = ctx.time
  var sources = ctx.sources
  var toast = ctx.toast
  var buzz = ctx.buzz
  var hideFloat = ctx.hideFloat
  var clock = ctx.clock

  var manualMs = 0
  var currentKey = 'beijing'

  function textOf(key, now) {
    var offset = sources.offsetMs(key, manualMs)
    var parts = sources.isDevice(key)
      ? time.parts(now, 'device', 0)
      : time.parts(now + offset, 'device', 0)
    return time.formatClock(parts)
  }

  function open() {
    el('live-clock').className = 'live-screen'
    el('live-mine').className = 'live-screen'
    el('live-clicker').className = 'live-screen'
    el('live-events').className = 'live-screen'
    el('live-sources').className = 'live-screen on'
    hideFloat()
    buzz(8)
  }

  function back() {
    el('live-sources').className = 'live-screen'
    el('live-clock').className = 'live-screen on'
    applyToClock()
    buzz(8)
  }

  function applyToClock() {
    clock.setSource({
      key: currentKey,
      name: sources.name(currentKey),
      source: sources.clockSource(currentKey),
      offset: sources.clockOffset(currentKey, manualMs)
    })
  }

  function paint(now) {
    var cards = qa('#live-sources .src-card')
    for (var i = 0; i < cards.length; i++) {
      var key = cards[i].getAttribute('data-key')
      if (!key) continue
      cards[i].className = 'src-card' + (key === currentKey ? ' src-active' : '')
      var timeNode = q('.src-time', cards[i])
      if (timeNode) {
        var t = textOf(key, now)
        if (timeNode.textContent !== t) timeNode.textContent = t
      }
      var descNode = q('.src-desc', cards[i])
      if (descNode) {
        var d = sources.descOf(key, manualMs)
        if (descNode.textContent !== d) descNode.textContent = d
      }
    }
    var manualNode = q('#live-sources .stepper-value')
    if (manualNode) {
      var mt = sources.signed(manualMs / 1000) + 's'
      if (manualNode.textContent !== mt) manualNode.textContent = mt
    }
    var current = q('#live-sources .status-time')
    if (current) {
      var ct = textOf(currentKey, now)
      if (current.textContent !== ct) current.textContent = ct
    }
    var nameNode = q('#live-sources .status-name')
    if (nameNode) {
      var nm = sources.name(currentKey)
      if (nameNode.textContent !== nm) nameNode.textContent = nm
    }
  }

  function select(key) {
    currentKey = key
    paint(Date.now())
    applyToClock()
    buzz(8)
    toast('已切换到 ' + sources.name(key))
  }

  // ---- 绑定 ----
  var row = q('#live-clock .quick-panel')
  if (row) {
    row.classList.add('live-tap')
    row.addEventListener('click', open)
  }
  var backBtn = q('#live-sources .back-btn')
  if (backBtn) {
    backBtn.classList.add('live-tap')
    backBtn.addEventListener('click', back)
  }
  var helpBtn = q('#live-sources .help-btn')
  if (helpBtn) {
    helpBtn.classList.add('live-tap')
    helpBtn.addEventListener('click', function () {
      toast('各平台时间已按网络延迟校准')
    })
  }
  var stepBtns = qa('#live-sources .step-btn')
  if (stepBtns[0]) {
    stepBtns[0].classList.add('live-tap')
    stepBtns[0].addEventListener('click', function () {
      manualMs = Math.max(-2000, manualMs - 50)
      paint(Date.now())
      applyToClock()
      toast('手动微调 ' + sources.signed(manualMs / 1000) + 's')
    })
  }
  if (stepBtns[1]) {
    stepBtns[1].classList.add('live-tap')
    stepBtns[1].addEventListener('click', function () {
      manualMs = Math.min(2000, manualMs + 50)
      paint(Date.now())
      applyToClock()
      toast('手动微调 ' + sources.signed(manualMs / 1000) + 's')
    })
  }
  qa('#live-sources .src-card').forEach(function (card) {
    var key = card.getAttribute('data-key')
    if (!key) return
    card.classList.add('live-tap')
    card.addEventListener('click', function () { select(key) })
  })
  qa('#live-sources .src-sync').forEach(function (btn) {
    var key = btn.getAttribute('data-key')
    if (!key) return
    btn.classList.add('live-tap')
    btn.addEventListener('click', function (e) {
      e.stopPropagation()
      sources.resync(key)
      paint(Date.now())
      applyToClock()
      toast(sources.isDevice(key) ? '设备时间无需校准' : '已重新校准 ' + sources.name(key))
    })
  })
  var addCard = q('#live-sources .src-add')
  if (addCard) {
    addCard.classList.add('live-tap')
    addCard.addEventListener('click', function () {
      toast('自定义时间源后续版本支持')
    })
  }

  applyToClock()
  paint(Date.now())

  return { paint: paint, open: open, back: back, select: select }
}