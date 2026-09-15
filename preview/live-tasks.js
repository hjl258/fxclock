// 「点击」页（现场预览用）：定时点击任务列表 + 毫秒级时间编辑弹层
// 由 build-live.js 注入到预览脚本中
function initTasksPreview(ctx) {
  var el = ctx.el
  var q = ctx.q
  var qa = ctx.qa
  var toast = ctx.toast
  var buzz = ctx.buzz
  var hideFloat = ctx.hideFloat

  function pad(n, len) {
    var s = String(Math.abs(Math.floor(n)))
    while (s.length < (len || 2)) s = '0' + s
    return s
  }
  function msDigitOf(ms) { var d = Math.round((ms || 0) / 100); return d < 0 ? 0 : (d > 9 ? 9 : d) }
  function fmt(p) { return pad(p.h) + ':' + pad(p.m) + ':' + pad(p.s) + '.' + msDigitOf(p.ms) }
  function hmsOf(p) { return pad(p.h) + ':' + pad(p.m) + ':' + pad(p.s) }
  function clamp(p) {
    if (p.ms > 999) { p.ms -= 1000; p.s += 1 }
    if (p.ms < 0) { p.ms += 1000; p.s -= 1 }
    if (p.s > 59) { p.s -= 60; p.m += 1 }
    if (p.s < 0) { p.s += 60; p.m -= 1 }
    if (p.m > 59) { p.m -= 60; p.h += 1 }
    if (p.m < 0) { p.m += 60; p.h -= 1 }
    if (p.h > 23) p.h -= 24
    if (p.h < 0) p.h += 24
    return p
  }
  function parse(text) {
    var m = String(text || '').trim().match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.(\d{1,3}))?$/)
    if (!m) return null
    var p = {
      h: parseInt(m[1], 10),
      m: parseInt(m[2], 10),
      s: m[3] === undefined ? 0 : parseInt(m[3], 10),
      ms: m[4] === undefined ? 0 : parseInt((m[4] + '00').slice(0, 3), 10)
    }
    if (p.h > 23 || p.m > 59 || p.s > 59 || p.ms > 999) return null
    return p
  }

  var TASKS = ctx.seed.map(function (t) { return { parts: t.parts, name: t.name, repeat: t.repeat, enabled: t.enabled, place: t.place || null } })
  var editing = false
  var editIndex = -1
  var cur = { h: 0, m: 0, s: 0, ms: 0 }

  function rows() { return qa('#live-clicker .task-card') }

  function paintRow(node, task) {
    var t1 = q('.task-time-main', node)
    if (t1 && t1.textContent !== hmsOf(task.parts)) t1.textContent = hmsOf(task.parts)
    var t2 = q('.task-time-ms', node)
    if (t2 && t2.textContent !== '.' + msDigitOf(task.parts.ms)) t2.textContent = '.' + msDigitOf(task.parts.ms)
    var places = qa('.task-place', node)
    if (places.length >= 2) {
      places[0].textContent = coordOf(task.place) ? ('X ' + Math.round(task.place.x)) : 'X NaN'
      places[1].textContent = coordOf(task.place) ? ('Y ' + Math.round(task.place.y)) : 'Y NaN'
    }
    var n1 = q('.task-name', node)
    if (n1 && n1.textContent !== task.name) n1.textContent = task.name
    var n2 = q('.task-repeat', node)
    if (n2 && n2.textContent !== (task.repeat === 'once' ? '仅一次' : '每天')) n2.textContent = task.repeat === 'once' ? '仅一次' : '每天'
  }

  // 恢复预设：把列表重置回 6 组（对应「我的 → 清除本地数据」）
  function resetTasks() {
    var seed = ctx.seed.map(function (t) {
      return { parts: t.parts, name: t.name, repeat: t.repeat, enabled: t.enabled, place: t.place || null }
    })
    TASKS.length = 0
    seed.forEach(function (t) { TASKS.push(t) })
    var list = rows()
    for (var i = list.length - 1; i >= seed.length; i--) {
      var card = list[i]
      var row = card ? ((card.closest && card.closest('.task-row')) || card) : null
      if (row && row.parentNode) row.parentNode.removeChild(row)
    }
    paintAll()
    paintFloatBar()
    if (typeof paintVbar === 'function') paintVbar() // 行数变了，滚动滑块要重算
    return TASKS.length
  }

  function paintAll() {
    var list = rows()
    for (var i = 0; i < list.length && i < TASKS.length; i++) paintRow(list[i], TASKS[i])
  }

  function paintSheet() {
    var vals = qa('#live-clicker .step-value')
    var keys = ['h', 'm', 's', 'ms']
    for (var i = 0; i < vals.length && i < keys.length; i++) {
      var v = keys[i] === 'ms' ? String(msDigitOf(cur.ms)) : pad(cur[keys[i]])
      if (vals[i].textContent !== v) vals[i].textContent = v
    }
    var main = q('#live-clicker .time-main')
    if (main) main.textContent = hmsOf(cur)
    var msNode = q('#live-clicker .time-ms')
    if (msNode) msNode.textContent = '.' + msDigitOf(cur.ms)
  }

  // ---- 坐标系取点 ----
  var place = null

  // 有限数字才算有效坐标 —— typeof NaN === 'number'，只判类型会漏
  function isCoord(v) { return typeof v === 'number' && isFinite(v) }
  function coordOf(p) { return !!(p && isCoord(p.x) && isCoord(p.y)) }

  function placeLabelOf(p) {
    if (!p) return "X NaN · Y NaN" // 未设置坐标时显示字面 NaN（表示「不是数字」）
    return "X " + Math.round(p.x) + " · Y " + Math.round(p.y)
  }

  function applyPlace(x, y) {
    if (!isCoord(x) || !isCoord(y)) return
    place = { x: Math.max(0, Math.min(375, Math.round(x))), y: Math.max(0, Math.min(812, Math.round(y))) }
    var text = q("#live-clicker .place-text")
    if (text) { text.textContent = placeLabelOf(place); text.className = "place-text place-on" }
    var tag = q("#live-clicker .place-tag")
    if (tag) tag.className = "place-tag"
    var marker = q("#live-clicker .coord-marker")
    if (marker) {
      marker.style.display = "block"
      marker.style.left = (place.x / 375 * 100) + "%"
      marker.style.top = (place.y / 812 * 100) + "%"
    }
  }

  // 真机上自定义 TabBar 是框架单独渲染的一层，弹层压不住它，只能主动隐藏；
  // 预览里同样处理，保证两边表现一致
  function setTabBarHidden(hidden) {
    var bar = q('.live-screen.on .tabbar-wrap')
    if (bar) bar.className = 'tabbar-wrap' + (hidden ? ' live-hidden' : '')
    // 顺带锁住页面滚动：真机靠 catchtouchmove，预览靠 overflow
    var screen = q('.live-screen.on')
    if (screen) {
      var cls = screen.className.replace(' sheet-open', '')
      screen.className = hidden ? cls + ' sheet-open' : cls
    }
  }

  function showSheet(index) {
    editing = true
    editIndex = index
    var task = index >= 0 ? TASKS[index] : null
    cur = task ? Object.assign({}, task.parts) : { h: new Date().getHours(), m: new Date().getMinutes(), s: new Date().getSeconds(), ms: new Date().getMilliseconds() }
    var mask = q('#live-clicker .mask')
    var sheet = q('#live-clicker .sheet')
    if (mask) mask.className = 'mask'
    if (sheet) sheet.className = 'sheet'
    setTabBarHidden(true)
    var title = q('#live-clicker .sheet-title')
    if (title) title.textContent = task ? '编辑定时点击' : '新建定时点击'
    var nameInput = qa('#live-clicker .form-input')[0]
    if (nameInput) nameInput.value = task ? task.name : ''
    var del = q('#live-clicker .danger-btn')
    if (del) del.className = 'danger-btn' + (task ? '' : ' fp-hide')
    var tags = qa('#live-clicker .seg-item')
    var repeat = task ? task.repeat : 'daily'
    for (var i = 0; i < tags.length; i++) {
      var on = (i === 0 && repeat !== 'once') || (i === 1 && repeat === 'once')
      tags[i].className = 'seg-item' + (on ? ' seg-on' : '')
    }
    // 位置区按被编辑项重置：未设坐标 → X 0 · Y 0，且不显示坐标标记与「清除」
    place = coordOf(task && task.place) ? { x: task.place.x, y: task.place.y } : null
    var ptext = q('#live-clicker .place-text')
    if (ptext) { ptext.textContent = placeLabelOf(place); ptext.className = 'place-text' + (place ? ' place-on' : '') }
    var ptag = q('#live-clicker .place-tag')
    if (ptag) ptag.className = 'place-tag' + (place ? '' : ' fp-hide')
    var pmarker = q('#live-clicker .coord-marker')
    if (pmarker) pmarker.style.display = place ? 'block' : 'none'
    if (place && pmarker) { pmarker.style.left = (place.x / 375 * 100) + '%'; pmarker.style.top = (place.y / 812 * 100) + '%' }
    paintSheet()
    buzz(8)
  }

  function hideSheet() {
    editing = false
    var mask = q('#live-clicker .mask')
    var sheet = q('#live-clicker .sheet')
    if (mask) mask.className = 'mask live-hidden'
    if (sheet) sheet.className = 'sheet live-hidden'
    setTabBarHidden(false)
  }

  // 毫秒位 0-9，越界时进位 / 借位到秒
  function bumpMsIn(parts, delta) {
    var p = Object.assign({}, parts)
    var d = msDigitOf(p.ms) + (delta > 0 ? 1 : -1)
    if (d > 9) { d = 0; p.s = (p.s || 0) + 1 }
    else if (d < 0) { d = 9; p.s = (p.s || 0) - 1 }
    p.ms = d * 100
    return clamp(p)
  }

  function step(key, delta) {
    if (key === "ms") {
      cur = bumpMsIn(cur, delta)
      paintSheet()
      return
    }
    cur[key] = (cur[key] || 0) + delta
    cur = clamp(cur)
    paintSheet()
  }

  function save() {
    var nameInput = qa('#live-clicker .form-input')[0]
    var name = (nameInput && nameInput.value) ? nameInput.value : '点击'
    var tags = qa('#live-clicker .seg-item')
    var repeat = (tags[1] && tags[1].className.indexOf('seg-on') >= 0) ? 'once' : 'daily'
    if (editIndex >= 0) {
      TASKS[editIndex] = { parts: Object.assign({}, cur), name: name, repeat: repeat, enabled: TASKS[editIndex].enabled, place: place }
      paintRow(rows()[editIndex], TASKS[editIndex])
      toast('已保存')
    } else {
      var task = { parts: Object.assign({}, cur), name: name, repeat: repeat, enabled: true, place: place }
      TASKS.push(task)
      // 克隆整行（.task-row = 删除按钮 + 卡片），只克隆卡片的话新条目既不能左滑也不能删
      var firstCard = rows()[0]
      var firstRow = rowOfCard(firstCard)
      var row = firstRow && firstRow.cloneNode ? firstRow.cloneNode(true) : null
      if (row) {
        row.className = 'task-row'
        var card = q('.task-card', row)
        if (card) card.className = 'task-card'
        var del = q('.task-delete', row)
        var body = q('#live-clicker .page-body')
        if (body) body.appendChild(row)
        if (card) {
          paintRow(card, task)
          bindRow(card)
          // 克隆行是新 DOM，删除按钮要单独绑（绑定在它自己那一行上，下标不会错）
          var db = q('.task-delete', row)
          if (db) {
            db.classList.add('live-tap')
            db.addEventListener('click', function () { removeRow(row, card) })
          }
        }
      }
      toast('已新建并启用')
    }
    hideSheet()
    buzz(10)
  }

  // 左滑露出删除（跟手位移，松手按位移判定）
  var OPEN_PX = 84
  function bindSwipe(node) {
    var start = null
    var open = false
    node.addEventListener("pointerdown", function (e) {
      start = { x: e.clientX, y: e.clientY, open: open }
      if (node.setPointerCapture) { try { node.setPointerCapture(e.pointerId) } catch (err) {} }
    })
    node.addEventListener("pointermove", function (e) {
      if (!start) return
      var base = start.open ? -OPEN_PX : 0
      var next = Math.max(-OPEN_PX - 20, Math.min(0, base + (e.clientX - start.x)))
      node.style.transform = "translateX(" + next + "px)"
    })
    node.addEventListener("pointerup", function (e) {
      if (!start) return
      var dx = e.clientX - start.x
      var dy = e.clientY - start.y
      var wasOpen = start.open
      start = null
      node.style.transform = ""
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
        if (wasOpen) { open = false; node.className = "task-card" }
        // 下标在事件发生时现算：删过条目后闭包里存的旧下标会错位
        else showSheet(rows().indexOf(node))
        return
      }
      if (dx < -40) open = true
      else if (dx > 40) open = false
      else open = wasOpen
      node.className = "task-card" + (open ? " task-open" : "")
    })
    node.addEventListener("pointercancel", function () { start = null; node.style.transform = "" })
  }

  function bindRow(node) {
    var card = node
    card.classList.add('live-tap')
    bindSwipe(card)
  }

  // ---- 生效状态：跟随「开启悬浮窗」 ----
  var floatOn = typeof ctx.getFloatOn === "function" ? !!ctx.getFloatOn() : ctx.floatOn !== false

  function syncFloat() {
    if (typeof ctx.getFloatOn === "function") floatOn = !!ctx.getFloatOn()
    paintFloatBar()
  }

  function paintFloatBar() {
    var bar = q("#live-clicker .float-bar")
    if (bar) bar.className = "float-bar" + (floatOn ? " float-bar-on" : "")
    var text = q("#live-clicker .float-bar-text")
    if (text) text.textContent = floatOn ? "悬浮窗已开启 · 定时点击生效中" : "悬浮窗未开启 · 定时点击不会生效"
    rows().forEach(function (node) {
      var open = node.className.indexOf("task-open") >= 0 ? " task-open" : ""
      node.className = "task-card" + open + (floatOn ? "" : " card-muted")
    })
  }

  // ---- 绑定 ----
  var panel = q("#live-clicker .coord-panel")
  if (panel) {
    panel.classList.add("live-tap")
    panel.addEventListener("click", function (e) {
      var rect = panel.getBoundingClientRect ? panel.getBoundingClientRect() : null
      var w = (rect && rect.width) ? rect.width : 335
      var h = (rect && rect.height) ? rect.height : 160
      var rx = rect ? (e.clientX - rect.left) : (e.clientX || 0)
      var ry = rect ? (e.clientY - rect.top) : (e.clientY || 0)
      if (!isCoord(rx) || !isCoord(ry)) return // 合成事件可能没有 clientX，别算出 NaN
      applyPlace(rx / w * 375, ry / h * 812)
      toast("已取点 " + placeLabelOf(place))
      buzz(8)
    })
  }
  var pickBtn = q("#live-clicker .pick-btn")
  if (pickBtn) {
    pickBtn.classList.add("live-tap")
    pickBtn.addEventListener("click", function () {
      var mask = q("#live-clicker .pick-mask")
      if (mask) mask.className = "pick-mask"
      setTabBarHidden(true)
      buzz(8)
    })
  }
  var pickMask = q("#live-clicker .pick-mask")
  if (pickMask) {
    pickMask.addEventListener("click", function (e) {
      pickMask.className = "pick-mask live-hidden" // 点一下就先收起遮罩，无论如何
      var screen = q("#live-clicker .page") || q("#live-clicker")
      var rect = screen && screen.getBoundingClientRect ? screen.getBoundingClientRect() : null
      var x = rect ? (e.clientX - rect.left) : (e.clientX || 0)
      var y = rect ? (e.clientY - rect.top) : (e.clientY || 0)
      if (!isCoord(x) || !isCoord(y)) return // 拿不到坐标就不写值（宁可不动，也不写 NaN）
      applyPlace(x, y)
      setTabBarHidden(false)
      toast("已记录位置 " + placeLabelOf(place))
      buzz(10)
    })
  }
  var pickCancel = q("#live-clicker .pick-cancel")
  if (pickCancel) {
    pickCancel.classList.add("live-tap")
    pickCancel.addEventListener("click", function (e) {
      e.stopPropagation()
      var mask = q("#live-clicker .pick-mask")
      if (mask) mask.className = "pick-mask live-hidden"
      setTabBarHidden(false)
    })
  }
  var clearBtn = q("#live-clicker .place-tag")
  if (clearBtn) {
    clearBtn.classList.add("live-tap")
    clearBtn.addEventListener("click", function (e) {
      e.stopPropagation()
      place = null
      var text = q("#live-clicker .place-text")
      if (text) { text.textContent = "X NaN · Y NaN"; text.className = "place-text" }
      var tag = q("#live-clicker .place-tag")
      if (tag) tag.className = "place-tag fp-hide" // 真机靠 wx:if 收起，预览手动收
      var marker = q("#live-clicker .coord-marker")
      if (marker) marker.style.display = "none"
      toast("已清除位置")
    })
  }
  var addBtn = q('#live-clicker .add-btn')
  if (addBtn) {
    addBtn.classList.add('live-tap')
    addBtn.addEventListener('click', function () { showSheet(-1) })
  }
  var mask = q('#live-clicker .mask')
  if (mask) mask.addEventListener('click', hideSheet)
  var closeBtn = q('#live-clicker .sheet-close')
  if (closeBtn) {
    closeBtn.classList.add('live-tap')
    closeBtn.addEventListener('click', hideSheet)
  }
  var saveBtn = q('#live-clicker .sheet .primary-btn')
  if (saveBtn) {
    saveBtn.classList.add('live-tap')
    saveBtn.addEventListener('click', save)
  }
  var delBtn = q('#live-clicker .danger-btn')
  if (delBtn) {
    delBtn.classList.add('live-tap')
    delBtn.addEventListener('click', function () {
      if (editIndex < 0) return
      var node = rows()[editIndex]
      if (node && node.parentNode) node.parentNode.removeChild(node)
      TASKS.splice(editIndex, 1)
      hideSheet()
      toast('已删除')
    })
  }
  var STEP_FALLBACK = ['h', 'm', 's', 'ms']
  qa('#live-clicker .step-btn').forEach(function (btn, i) {
    btn.classList.add('live-tap')
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-key') || STEP_FALLBACK[Math.floor(i / 2)]
      var delta = btn.getAttribute('data-delta')
      delta = delta === null || delta === undefined ? (i % 2 === 0 ? -1 : 1) : Number(delta)
      step(key, delta)
    })
  })
  var repeatSegs = qa('#live-clicker .seg-item')
  repeatSegs.forEach(function (seg, i) {
    seg.classList.add('live-tap')
    seg.addEventListener('click', function () {
      repeatSegs.forEach(function (s2, j) { s2.className = 'seg-item' + (j === i ? ' seg-on' : '') })
    })
  })
  var placeRow = qa('#live-clicker .form-row')
  if (placeRow.length) {
    var place = placeRow[placeRow.length - 1]
    place.classList.add('live-tap')
    place.addEventListener('click', function () { toast('位置设置已预留，后续版本开放') })
  }
  // 卡片一定包在 .task-row 里（左滑露出的删除按钮是它的兄弟节点）
  function rowOfCard(card) {
    if (!card) return null
    return (card.closest && card.closest('.task-row')) || card
  }
  function afterRemove() {
    toast('已删除')
    buzz(10)
    paintFloatBar()
    if (typeof paintVbar === 'function') paintVbar() // 行数变了，滚动滑块重算
  }
  function removeRow(rowNode, cardNode) {
    var idx = cardNode ? rows().indexOf(cardNode) : -1
    var target = rowNode || cardNode
    if (target && target.parentNode) target.parentNode.removeChild(target)
    if (idx >= 0) TASKS.splice(idx, 1)
    afterRemove()
  }
  // 先把「最新下标」算出来再删：删过条目之后按序号绑定的旧下标会错位
  function removeAtIndex(index) {
    var card = rows()[index]
    if (card) removeRow(rowOfCard(card), card)
  }
  function bindDeleteBtn(btn, index) {
    if (!btn) return
    btn.classList.add('live-tap')
    btn.addEventListener('click', function () { removeAtIndex(index) })
  }
  qa('#live-clicker .task-delete').forEach(bindDeleteBtn)
  // 初始隐藏坐标标记与取点遮罩（WXML 里由 wx:if 控制，预览需要手动）
  var initMarker = q("#live-clicker .coord-marker")
  if (initMarker) initMarker.style.display = "none"
  var initMask = q("#live-clicker .pick-mask")
  if (initMask) initMask.className = "pick-mask live-hidden"
  qa('.tab-item').forEach(function (item, i) { if (i === 1) item.addEventListener('click', syncFloat) })
  rows().forEach(function (node) { bindRow(node) })
  hideSheet()
  hideFloat()

  paintFloatBar()
  return { paintAll: paintAll, showSheet: showSheet, hideSheet: hideSheet, step: step, save: save, syncFloat: syncFloat, resetTasks: resetTasks,
    // 「点击」状态圆用：定时列表里是否存在距当前时刻 ±5 分钟的项
    //   hasTaskNear / NEAR_WINDOW_MS 来自 utils/tasks.js 原样内联的块（见 build-live.js）
    hasNear: function (parts, win) { return hasTaskNear(TASKS, parts, win) } }
}