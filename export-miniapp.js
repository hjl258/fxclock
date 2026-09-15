const fs = require('fs')
const path = require('path')
const ROOT = __dirname
const OUT = process.argv[2] || path.join(process.env.USERPROFILE, 'Desktop', '定时点击器')

/* 打进「小程序」的东西：只包含真正参与编译的目录与文件。
   preview / android-overlay / ios-pip / cleanup.ps1 / pages(未注册的 hot、tools) 都不要。 */
const FILES = [
  'app.js', 'app.json', 'app.wxss', 'sitemap.json',
  'project.config.json', 'project.private.config.json', 'README.md'
]
const DIRS = ['pages/clock', 'pages/mine', 'pages/events', 'pages/timeSource', 'pages/clicker',
  'components/ring-clock', 'components/float-clock', 'custom-tab-bar', 'utils']

function walk(dir, base) {
  const out = []
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const rel = base ? base + '/' + name : name
    if (fs.statSync(full).isDirectory()) out.push(...walk(full, rel))
    else out.push(rel)
  }
  return out
}

// 1) 收集要导出的文件
const list = []
FILES.forEach((f) => list.push(f))
DIRS.forEach((d) => walk(path.join(ROOT, d), d).forEach((f) => list.push(f)))

// 2) 写出去（已存在就覆盖，不删）
let copied = 0
list.forEach((rel) => {
  const to = path.join(OUT, rel)
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(path.join(ROOT, rel), to)
  copied++
})

// 额外写一份导入说明（README 里有本机开发路径，不往导出目录里带）
fs.writeFileSync(path.join(OUT, '导入说明.txt'), [
  '微信小程序 · 导入说明',
  '',
  '1. 打开微信开发者工具 → 小程序 → 导入项目',
  '2. 目录：选择本文件夹',
  '3. AppID：project.config.json 里已经填好 wx204a54ab304970bd，导入时保持默认即可（要换成别的号就手改这一行）',
  '4. 导入后直接编译即可运行，无需 npm install、无外部依赖',
  '',
  '页面：时钟(首页) / 点击(定时点击) / 我的 / 抢购事件 / 时间源',
  '底栏：时钟 · 点击 · 我的',
  '',
  '说明：悬浮窗组件在时钟/点击/我的/事件/时间源 五个页面都挂了实例，开关跨页共享并持久化。',
  '「我的 → 清除本地数据」会把定时点击恢复到 6 组预设。',
  ''
].join('\r\n'), 'utf8')

console.log('已导出到: ' + OUT)
console.log('文件数: ' + copied)

// 3) 自检：导出的这份必须能独立编译
const app = JSON.parse(fs.readFileSync(path.join(OUT, 'app.json'), 'utf8'))
const problems = []
app.pages.forEach((p) => {
  for (const ext of ['js', 'json', 'wxml']) {
    const f = path.join(OUT, p + '.' + ext)
    if (!fs.existsSync(f)) problems.push('缺少页面文件: ' + p + '.' + ext)
  }
})
const pageDirs = app.pages.map((p) => path.dirname(p))
const allJson = []
;(function collect(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) collect(full)
    else if (name.endsWith('.json')) allJson.push(full)
  }
})(OUT)
allJson.forEach((f) => {
  let cfg
  try { cfg = JSON.parse(fs.readFileSync(f, 'utf8')) } catch (e) { problems.push('JSON 解析失败: ' + path.relative(OUT, f)); return }
  const uc = cfg.usingComponents || {}
  Object.keys(uc).forEach((k) => {
    const target = uc[k].replace(/^\//, '')
    if (!fs.existsSync(path.join(OUT, target + '.wxml'))) problems.push(path.relative(OUT, f) + ' 引用的组件不存在: ' + uc[k])
  })
})
if (app.tabBar && app.tabBar.custom) {
  for (const ext of ['js', 'json', 'wxml', 'wxss']) {
    if (!fs.existsSync(path.join(OUT, 'custom-tab-bar', 'index.' + ext))) problems.push('缺少 custom-tab-bar/index.' + ext)
  }
}
// 不能混进与小程序的无关目录
;['preview', 'android-overlay', 'ios-pip', 'pages/hot', 'pages/tools', 'cleanup.ps1'].forEach((bad) => {
  if (fs.existsSync(path.join(OUT, bad))) problems.push('不该导出的内容混进来了: ' + bad)
})
// 不能有绝对路径残留
list.forEach((rel) => {
  if (!/\.(js|json|wxml|wxss|md)$/.test(rel)) return
  const t = fs.readFileSync(path.join(OUT, rel), 'utf8')
  if (/C:\\Users|C:\/Users/.test(t)) problems.push('含绝对路径: ' + rel)
})

if (problems.length) {
  console.log('⚠️ 自检发现问题:')
  problems.forEach((p) => console.log('  - ' + p))
  process.exit(1)
}
console.log('自检通过：页面 ' + app.pages.length + ' 个、组件引用全部可解析、无多余目录、无绝对路径')
