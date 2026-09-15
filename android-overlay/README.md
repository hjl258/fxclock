# 悬浮时钟 · Android 系统级悬浮窗

让「毫秒级时间 + 抢购倒计时」真正浮在**桌面和其它应用之上**。

## 为什么需要它（平台边界）

| 平台 | 能否浮在桌面/其它 App 之上 | 说明 |
| --- | --- | --- |
| **微信小程序** | ❌ 不能 | 小程序运行在微信沙箱内，没有创建系统级悬浮窗的 API；小程序里的「悬浮窗」只能是页内浮层，切到别的 App 就看不见了 |
| **Android 原生** | ✅ 可以 | `SYSTEM_ALERT_WINDOW`（显示在其他应用上层）+ `TYPE_APPLICATION_OVERLAY` + 前台服务保活，本模块即此方案 |
| **iOS 原生** | ⚠️ 只能靠画中画 | 系统禁止普通 App 覆盖桌面，但**画中画窗口**（`AVPictureInPictureController`）可以浮在所有 App 之上 —— 见隔壁 `../ios-pip/`。限制：只能显示，不能模拟点击别家 App；必须用户点一次开启（或切后台自动进入）；窗口尺寸/位置由系统控制 |
| 微信客户端「浮窗」 | ⚠️ 用户手动 | 右上角 `…` → 浮窗，由用户触发，可让小程序以浮窗形式驻留在其它 App 之上，可用性取决于微信版本与系统 |

## 能力边界（重要）

| 能力 | 微信小程序 | 本 Android 工程 | iOS 画中画工程 |
| --- | --- | --- | --- |
| 浮在桌面/其它 App 之上 | ❌ | ✅ 系统级悬浮窗 | ✅ 画中画窗口 |
| 锁屏/切应用后持续走时 | ❌ | ✅ 前台服务保活 | ✅ 静音音频保活 |
| **自动点击其它 App** | ❌ | ❌ **未实现**（需要 `AccessibilityService` + `dispatchGesture`） | ❌ 系统完全禁止 |

也就是说：本工程当前只做「显示」。要做到"到点自动点别的 App 的抢购按钮"，还需要补一个
`AccessibilityService`（Android 官方给无障碍场景的 API），由用户在系统设置里手动授权后，
才能在别的应用里派发点击手势。

## 功能

- 悬浮胶囊：`HH:MM:SS.d`（毫秒十分位，与小程序一致）+ 北京时间 + 距下一场 20:00 的倒计时 `HH:MM:SS:T`
- 可拖动：按住胶囊拖到任意位置；不拖动时正常响应点击
- 到点提醒：归零时震动一次并自动滚到下一场
- 常驻通知：「停止」按钮可随时关闭悬浮窗；胶囊右上角 `×` 同样可关闭
- 前台服务（`specialUse`）保活，锁屏/切应用不被回收

## 构建

需要 Android Studio（或本机 JDK 17 + Android SDK 34）。

```bash
# 命令行构建（需本地已配置 ANDROID_HOME）
cd android-overlay
./gradlew assembleDebug          # Windows: gradlew.bat assembleDebug
# 产物：app/build/outputs/apk/debug/app-debug.apk
```

Android Studio：`File → Open` 选择 `android-overlay` 目录（含 `settings.gradle.kts`），直接 Run。

## 首次使用流程

1. 安装运行 App → 首页点「授予悬浮窗权限」→ 系统设置里打开「显示在其他应用上层」
2. 返回 App（权限状态会刷新为「已授予」）→ 点「开启悬浮窗」
3. 回到桌面或打开任意其它应用，悬浮胶囊会一直显示在最上层
4. 关闭：点胶囊上的 `×`，或用通知里的「停止」，或回 App 点「关闭悬浮窗」

## 目录

```
android-overlay/
├── settings.gradle.kts / build.gradle.kts / gradle.properties
└── app/
    ├── build.gradle.kts                     compileSdk 34 / minSdk 24
    └── src/main/
        ├── AndroidManifest.xml              SYSTEM_ALERT_WINDOW + specialUse 前台服务
        ├── java/com/fxclock/overlay/
        │   ├── MainActivity.kt              权限申请、开启/关闭
        │   ├── ClockOverlayService.kt       悬浮窗 + 前台服务 + 走时渲染
        │   └── BeijingTime.kt               与小程序 utils/time.js 对齐的时间计算
        └── res/
            ├── layout/overlay_clock.xml     悬浮胶囊布局
            ├── layout/activity_main.xml     主界面
            ├── drawable/*.xml               背景与圆点
            └── values/strings.xml, themes.xml
```

## 已验证 / 未验证

**已静态验证**（本机构建环境无 Android SDK，故未编译）：

- 8 个 XML 全部可通过 XML 解析器
- 3 个 Kotlin 文件括号配平（`{}` `()` `[]`）
- Kotlin 里引用的 `R.id.*` / `R.layout.*` / `R.drawable.*` / `R.string.*` 共 17 处全部能在资源中找到
- Manifest：4 项权限声明、`foregroundServiceType="specialUse"`、Android 14 要求的 `PROPERTY_SPECIAL_USE_FGS_SUBTYPE`、Android 12+ 必需的 `exported`

**未验证**：编译与真机运行（环境内没有 Android SDK / 设备）。拉到 Android Studio 编译一次即可确认。

## 与小程序的时间算法一致性

`BeijingTime.kt` 与 `utils/time.js` 对应：

| 小程序 | Android |
| --- | --- |
| `parts(ms,'beijing')` | `BeijingTime.now("beijing")` |
| `formatClock(p)` → `HH:MM:SS.d` | `BeijingTime.clockText(p)` |
| `nextBeijing(h,m,s)` | `BeijingTime.nextBeijing(h,m,s)` |
| `countdownParts()` → `时:分:秒:十分位` | `BeijingTime.countdownText(remain)` |

两端都以 UTC+8 挂钟计算，不受手机时区影响，因此悬浮窗与小程序显示的倒计时完全一致。