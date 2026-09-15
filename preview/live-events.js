// 抢购事件页（现场预览用）：卡片点击进入、返回、设为卡片、删除、新建
// 由 build-live.js 注入到预览页脚本中，上下文由外部传入
function initEventsPreview(ctx) {
  var el = ctx.el
  var q = ctx.q
  var qa = ctx.qa
  var time = ctx.time
  var toast = ctx.toast
  var buzz = ctx.buzz
  var hideFloat = ctx.hideFloat
  var clock = ctx.clock

  var EVENTS = ctx.seed.slice()
  var activeIndex = 0

  function eventTargetTs(ev) {
    var hms = time.parseHMS(ev.at)
    return time.nextBeijing(hms.h, hms.m, hms.s, Date.now())
  }

  function open() {
    el('live-clock').className = 'live-screen'
    el('live-mine').className = 'live-screen'
    el('live-events').className = 'live-screen on'
    hideFloat()
    hideSheetLocal()
    paint(Date.now())
    buzz(8)
  }

  function back() {
    el('live-events').className = 'live-screen'
    el('live-clock').className = 'live-screen on'
    applyActive()
    buzz(8)
  }

  // 把当前选中的事件同步到首页卡片
  function applyActive() {
    var ev = EVENTS[activeIndex]
    if (!ev) return
    clock.setTarget(eventTargetTs(ev))
    var title = q('#live-clock .event-title')
    if (title) title.textContent = ev.title
    var price = q('#live-clock .price-num')
    if (price) price.textContent = ev.price
  }

  function paint(now) {
    var cards = qa('#live-events .ev-card')
    for (var i = 0; i < cards.length && i < EVENTS.length; i++) {
      var ts = eventTargetTs(EVENTS[i])
      var cd = time.countdownParts(ts, now)
      var digits = qa('.ev-digit', cards[i])
      if (digits.length === 4) {
        if (digits[0].textContent !== cd.h) digits[0].textContent = cd.h
        if (digits[1].textContent !== cd.m) digits[1].textContent = cd.m
        if (digits[2].textContent !== cd.s) digits[2].textContent = cd.s
        if (digits[3].textContent !== cd.t) digits[3].textContent = cd.t
      }
      var target = q('.ev-target', cards[i])
      if (target) {
        var label = time.dayOffsetLabel(ts, now) + ' ' + time.clockLabel(ts)
        if (target.textContent !== label) target.textContent = label
      }
      cards[i].className = 'ev-card' + (i === activeIndex ? ' ev-active' : '')
    }
  }

  function syncBadges() {
    var cards = qa('#live-events .ev-card')
    for (var i = 0; i < cards.length; i++) {
      var text = q('.ev-action-text', cards[i])
      if (text) text.textContent = (i === activeIndex) ? '当前卡片' : '设为卡片'
      var badge = q('.ev-badge', cards[i])
      if (badge) badge.className = (i === activeIndex) ? 'ev-badge' : 'ev-badge live-hidden'
    }
  }

  function hideSheetLocal() {
    var mask = q('#live-events .mask')
    var sheet = q('#live-events .sheet')
    if (mask) mask.className = 'mask live-hidden'
    if (sheet) sheet.className = 'sheet live-hidden'
  }

  function showSheetLocal() {
    var mask = q('#live-events .mask')
    var sheet = q('#live-events .sheet')
    if (mask) mask.className = 'mask'
    if (sheet) sheet.className = 'sheet'
    buzz(8)
  }

  function bindCards() {
    qa('#live-events .ev-card').forEach(function (card, i) {
      var actions = qa('.ev-action', card)
      if (actions[0] && !actions[0].getAttribute('data-bound')) {
        actions[0].setAttribute('data-bound', '1')
        actions[0].classList.add('live-tap')
        actions[0].addEventListener('click', function (e) {
          e.stopPropagation()
          activeIndex = i
          syncBadges()
          toast('已设为首页卡片')
          setTimeout(back, 350)
        })
      }
      if (actions[1] && !actions[1].getAttribute('data-bound')) {
        actions[1].setAttribute('data-bound', '1')
        actions[1].classList.add('live-tap')
        actions[1].addEventListener('click', function (e) {
          e.stopPropagation()
          var index = qa('#live-events .ev-card').indexOf(card)
          if (card.parentNode) card.parentNode.removeChild(card)
          if (index >= 0) EVENTS.splice(index, 1)
          if (activeIndex >= EVENTS.length) activeIndex = 0
          syncBadges()
          toast('已删除')
        })
      }
    })
  }

  function buildCard(ev) {
    var first = q('#live-events .ev-card')
    if (!first) return null
    var node = first.cloneNode(true)
    var title = q('.ev-title', node)
    if (title) title.textContent = ev.title
    var price = q('.ev-price', node)
    if (price) price.textContent = '¥ ' + ev.price
    var tag = q('.ev-tag', node)
    if (tag) tag.textContent = ev.tag
    var actions = qa('.ev-action', node)
    for (var i = 0; i < actions.length; i++) actions[i].removeAttribute('data-bound')
    return node
  }

  // ---- 绑定 ----
  var card = q('#live-clock .event-card')
  if (card) {
    card.classList.add('live-tap')
    card.addEventListener('click', open)
  }
  var backBtn = q('#live-events .back-btn')
  if (backBtn) {
    backBtn.classList.add('live-tap')
    backBtn.addEventListener('click', back)
  }
  var addBtn = q('#live-events .add-btn')
  if (addBtn) {
    addBtn.classList.add('live-tap')
    addBtn.addEventListener('click', showSheetLocal)
  }
  var mask = q('#live-events .mask')
  if (mask) mask.addEventListener('click', hideSheetLocal)
  var closeBtn = q('#live-events .sheet-close')
  if (closeBtn) {
    closeBtn.classList.add('live-tap')
    closeBtn.addEventListener('click', hideSheetLocal)
  }
  var saveBtn = q('#live-events .sheet .primary-btn')
  if (saveBtn) {
    saveBtn.classList.add('live-tap')
    saveBtn.addEventListener('click', function () {
      var inputs = qa('#live-events .form-input')
      var title = (inputs[0] && inputs[0].value) ? inputs[0].value : ''
      if (!title) { toast('请填写商品标题'); return }
      var ev = {
        title: title,
        price: (inputs[1] && inputs[1].value) || '0.00',
        platform: (inputs[2] && inputs[2].value) || '自定义',
        tag: '自定义',
        at: '20:00:00'
      }
      var body = q('#live-events .page-body')
      var node = buildCard(ev)
      if (body && node) body.appendChild(node)
      EVENTS.push(ev)
      activeIndex = EVENTS.length - 1
      bindCards()
      syncBadges()
      hideSheetLocal()
      toast('已添加并设为首页卡片')
      setTimeout(back, 350)
    })
  }
  var segs = qa('#live-events .seg-item')
  segs.forEach(function (seg) {
    seg.classList.add('live-tap')
    seg.addEventListener('click', function () {
      segs.forEach(function (s) { s.className = s.className.replace(' seg-on', '') })
      seg.className = seg.className + ' seg-on'
    })
  })
  var tags = qa('#live-events .tag')
  tags.forEach(function (tag) {
    tag.classList.add('live-tap')
    tag.addEventListener('click', function () {
      tags.forEach(function (t) { t.className = t.className.replace(' tag-on', '') })
      tag.className = tag.className + ' tag-on'
    })
  })

  hideSheetLocal()
  bindCards()
  syncBadges()

  return { paint: paint, open: open, back: back }
}