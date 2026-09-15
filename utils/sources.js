// 时间源清单：设备时间 / 北京时间（国家授时）/ 各平台服务器时间
// kind: device=跟随本机；beijing=北京时间基准；server=平台服务器（已校准）
const SOURCES = [
  { key: 'device', name: '设备时间', kind: 'device', calibMs: 0, color: '#ff4d4f', badge: '设' },
  { key: 'beijing', name: '北京时间', kind: 'beijing', calibMs: 11258.4, color: '#e23c3c', badge: '北京' },
  { key: 'taobao', name: '淘宝', kind: 'server', calibMs: 11250.7, color: '#ff5000', badge: '淘' },
  { key: 'tmall', name: '天猫', kind: 'server', calibMs: 11256.1, color: '#ff0036', badge: '天猫' },
  { key: 'jd', name: '京东', kind: 'server', calibMs: 11255.9, color: '#e1251b', badge: '京东' },
  { key: 'damai', name: '大麦', kind: 'server', calibMs: 11255.3, color: '#ff6a00', badge: '大麦' },
  { key: 'pdd', name: '拼多多', kind: 'server', calibMs: 11257.4, color: '#e02e24', badge: '拼' },
  { key: 'unionpay', name: '云闪付', kind: 'server', calibMs: 11253.3, color: '#d81e06', badge: '云闪付' },
  { key: 'meituan', name: '美团', kind: 'server', calibMs: 11251.5, color: '#ffc300', badge: '美团' }
]

const DEFAULT_KEY = 'beijing'

function list() {
  return SOURCES
}

function get(key) {
  for (let i = 0; i < SOURCES.length; i++) {
    if (SOURCES[i].key === key) return SOURCES[i]
  }
  return SOURCES[1]
}

function name(key) {
  return get(key).name
}

function isDevice(key) {
  return get(key).kind === 'device'
}

/** 该时间源相对本机时钟的偏移（毫秒），含手动微调 */
function offsetMs(key, manualMs) {
  return get(key).calibMs + (manualMs || 0)
}

function signed(seconds) {
  return (seconds >= 0 ? '+' : '') + seconds.toFixed(4)
}

/** 卡片副标题：设备时间 / 已校准:+11.2584s */
function descOf(key, manualMs) {
  if (isDevice(key)) return '设备时间'
  return '已校准:' + signed(offsetMs(key, manualMs) / 1000) + 's'
}

/** 环形时钟取值方式：设备时间走本机挂钟；其余源走「设备挂钟 + 补偿」，与卡片显示完全一致 */
function clockSource(key) {
  return isDevice(key) ? 'device' : 'server'
}

/** 环形时钟需要补偿的毫秒数 */
function clockOffset(key, manualMs) {
  return isDevice(key) ? 0 : offsetMs(key, manualMs)
}

/** 重新校准：模拟网络往返抖动 */
function resync(key) {
  const item = get(key)
  if (item.kind === 'device') return item.calibMs
  const jitter = (Math.random() - 0.5) * 4
  item.calibMs = Math.round((item.calibMs + jitter) * 10) / 10
  return item.calibMs
}

module.exports = {
  SOURCES: SOURCES,
  DEFAULT_KEY: DEFAULT_KEY,
  list: list,
  get: get,
  name: name,
  isDevice: isDevice,
  offsetMs: offsetMs,
  descOf: descOf,
  clockSource: clockSource,
  clockOffset: clockOffset,
  resync: resync,
  signed: signed
}