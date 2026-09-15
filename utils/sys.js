// 屏幕/胶囊信息兼容封装
function windowInfo() {
  try {
    if (wx.getWindowInfo) return wx.getWindowInfo()
  } catch (e) {}
  try {
    return wx.getSystemInfoSync()
  } catch (e) {
    return { statusBarHeight: 20, screenWidth: 375, pixelRatio: 2 }
  }
}

function rpx2px(rpx, screenWidth) {
  const w = screenWidth || windowInfo().screenWidth || 375
  return (rpx * w) / 750
}

module.exports = { windowInfo, rpx2px }