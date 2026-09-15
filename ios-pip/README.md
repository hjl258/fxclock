# 悬浮时钟 · iOS 画中画悬浮窗

用**画中画（Picture in Picture）**把「毫秒级时间 + 抢购倒计时」浮在桌面和其它 App 之上。

## 原理（为什么 iOS 上只有这条路）

iOS 不允许第三方 App 画系统级悬浮窗，但 **画中画窗口**可以浮在桌面与其它 App 之上。iOS 15 起，`AVPictureInPictureController` 提供了 `ContentSource(sampleBufferDisplayLayer:playbackDelegate:)`，允许把**任意内容**（不只是视频）渲染进画中画窗口：

```
CVPixelBuffer(480×240)  ← Core Graphics 画时间/倒计时
        │  每 100ms 一帧
        ▼
CMSampleBuffer（带 DisplayImmediately）
        ▼
AVSampleBufferDisplayLayer
        ▼
AVPictureInPictureController.ContentSource  →  画中画窗口（浮在所有 App 之上）
        ▲
   静音音频保活（AVAudioSession .playback + UIBackgroundModes: audio）
```

关键点：

- 内容是我们自己画的（`ClockFrameRenderer`），所以画中画里显示的是**毫秒走时与抢购倒计时**，而不是视频
- `canStartPictureInPictureAutomaticallyFromInline = true`：开启后切到后台会自动进入画中画
- 必须有 `UIBackgroundModes: audio` 且音频会话活跃，否则离开 App 后系统会挂起渲染。`SilenceAudioKeepAlive` 循环播放一段全 0 音频（输出音量 0，不会出声）来保活

## 环境要求

- Xcode 15+（Swift 5.9）
- iOS 17.0+ 部署目标（画中画本身支持 iOS 15+；本工程用了 iOS 17 的 `onChange(of:_:)` 新签名）。**你的 iOS 26 完全覆盖**
- 真机调试需要 Apple ID（免费账号即可自签，7 天有效期；付费账号可长期）

## 生成并运行

**方式 A：XcodeGen（推荐，一条命令）**

```bash
brew install xcodegen
cd ios-pip
xcodegen generate          # 依据 project.yml 生成 ClockPiP.xcodeproj
open ClockPiP.xcodeproj    # 选真机 → Run
```

**方式 B：手动创建**

1. Xcode → New Project → iOS → App，Product Name `ClockPiP`，Interface **SwiftUI**，Language **Swift**
2. 把 `ClockPiP/` 下的 5 个 `.swift` 全部拖进工程（勾选 Copy items if needed 之外的"加入目标"）
3. `Info.plist` 替换为工程内这份（关键是 `UIBackgroundModes = [audio]`）
4. Target → Signing & Capabilities → 选择你的 Team；Background Modes 勾上 **Audio, AirPlay, and Picture in Picture**

## 打包 IPA

**先说清楚：IPA 只能在 macOS 上产出**（需要 Xcode 的 iOS SDK 与签名工具链），
Windows / Linux 一律不行，WSL 也不行。下面三条路挑一条：

### 路线 A：有 Mac —— 一条命令

```bash
cd ios-pip
./build-ipa.sh                       # 出未签名 IPA（给重签工具用）
TEAM_ID=你的TeamID ./build-ipa.sh     # 出已签名 IPA（直接装自己手机）
```

产物：

| 文件 | 说明 |
| --- | --- |
| `build/ClockPiP-unsigned.ipa` | 未签名。用 Sideloadly / AltStore 安装时会用你的 Apple ID 重新签名 |
| `build/ClockPiP.ipa` | 已签名（只有传了 `TEAM_ID` 才有）。可直接 AirDrop / 设备管理里安装 |

脚本会自己判断：没装 `xcodegen` 会提示 `brew install xcodegen`；没有 `.xcodeproj` 会先生成。

### 路线 B：没有 Mac —— 用 GitHub Actions 的 macOS 机器

**第 1 步：在 GitHub 建一个空仓库**

网页版 GitHub → 右上角 `+` → **New repository** → 名字随便（如 `fxclock`）→
**不要**勾 Add a README / .gitignore / license（要空仓库）→ Create。
建好后页面会显示仓库地址，形如 `https://github.com/你的用户名/fxclock.git`。

**第 2 步：把本地项目推上去**

项目已经在本机初始化好 git 了（含 `.gitignore` / `.gitattributes` 和第一次提交），
所以只需要接上远端再推一次：

```powershell
cd "C:\Users\陈\Documents\ChatGPT\定时点击器"
git remote add origin https://github.com/你的用户名/fxclock.git
git push -u origin main
```

- 第一次推会弹出浏览器让你登录 GitHub（或让你填 Personal Access Token）
- 之后再改代码，就是 `git add -A` → `git commit -m "说明"` → `git push`

**第 3 步：让它跑起来**

1. 打开仓库页面 → 顶部 **Actions** 标签
2. 如果看到 "Workflows aren't being run on this repository" 之类的提示，点绿色按钮启用一下
3. 左侧选 **Build iOS IPA**（这个工作流是手动触发的）→ 右侧 **Run workflow** → 分支选 `main` →
   第二个输入框 `team_id` **留空**（留空就出未签名包）→ 点绿色的 **Run workflow**
4. 大约 3～5 分钟跑完，状态变绿 ✓

**第 4 步：下载 IPA**

点进这次 run → 页面最下方 **Artifacts** 区 → 下载 **ClockPiP-unsigned-ipa**
（GitHub 下载下来是个 zip，解压后里面就是 `ClockPiP-unsigned.ipa`）。

> 免费账号的额度：私有仓库用 macOS runner 按 10 倍计费，这个工程一次约 3 分钟 → 折合 30 分钟，
> 免费额度 2000 分钟/月，随便跑。仓库设为 public 则完全不扣。

**第 5 步：装到 iPhone（Windows 电脑就行）**

1. 装 iTunes（或 Win11 的「Apple 设备」App）—— Sideloadly 要靠它认设备
2. 装 [Sideloadly](https://sideloadly.io/)（也有 macOS 版）
3. iPhone 用数据线连电脑 → 手机上点「信任此电脑」
4. 打开 Sideloadly：把 `ClockPiP-unsigned.ipa` 拖进 `IPA` 框 → `Apple ID` 填你的（**免费账号即可**）→ Start
5. 手机会装上一个「悬浮时钟」→ 首次打开前先在
   **设置 → 通用 → VPN 与设备管理 → 开发者 App** 里点「信任」
6. 打开 App → 点「开启画中画」→ 回桌面或打开微信，时钟就浮在最上层了

> **7 天限制**：免费 Apple ID 签的 App 有效期 7 天，到期要重装一次（Sideloadly 重跑第 4～5 步即可）。
> 想省事可以装 AltStore（同一 Wi-Fi 下用 AltServer 自动续签），或买 $99/年的开发者账号（有效期 1 年）。
> 已签名 IPA 需要证书，Actions 里要另外配 p12 / fastlane match；自用直接走未签名 + 重签最省事。

### 路线 C：打开 Xcode 手动 Archive

`Product → Archive → Distribute App → Development/Ad Hoc`，
ExportOptions 可用工程里那份 `ExportOptions.plist`（把 `YOUR_TEAM_ID` 换成你的 Team ID）。

### 签名与有效期（自用必看）

| 你的账号 | 能装多久 | 怎么装 |
| --- | --- | --- |
| 免费 Apple ID | **7 天**，到期要重签一次 | Sideloadly / AltStore / Xcode 直接 Run |
| 付费开发者账号（$99/年） | 1 年 | Xcode Archive 出的 IPA，或 TestFlight |
| 越狱设备 | 不限 | 未签名 IPA 直接装（TrollStore 等） |

**注意**：工程用了 `UIBackgroundModes: audio` + 画中画，这两项都不需要额外 entitlement，
所以免费账号也能编、也能装 ✓（不需要付费账号的特殊能力）。

## 使用

1. 运行 App → 首页点 **开启画中画**（首次会弹系统提示）
2. 上滑回桌面，或打开微信等任意 App，时钟窗口会一直浮在最上层
3. 拖动窗口可移动；点窗口内的按钮可放大 / 暂停 / 关闭
4. 也可先点开启再切后台，系统会自动进入画中画（`canStartPictureInPictureAutomaticallyFromInline`）
5. 暂停按钮会暂停刷新，播放按钮恢复；关闭按钮退出画中画

## v1.1 修了什么（真机反馈）

**症状**：App 装上了，但点「开启画中画」毫无反应，界面上也没有任何提示。

**根因**：`AVPictureInPictureController.ContentSource(sampleBufferDisplayLayer:)` 要求这个
`AVSampleBufferDisplayLayer` **已经加在屏幕上真实存在的视图层级里**。上一版只把 layer 创建出来、
没有挂到任何视图上，于是 `isPictureInPicturePossible` 永远是 `false`；
而 `startPictureInPicture()` 在 possible 为 false 时是**静默无副作用**的 —— 表现就是「点了没反应」。

**改法**：

| 改动 | 说明 |
| --- | --- |
| 新增 `PiPDisplayLayerView` | UIViewRepresentable，把显示层挂到界面上（顺带当画中画的「同屏预览」），进出窗口时回调控制器 |
| `PiPClockController` 改为 ObservableObject | `supported / possible / active / lastError` 全部暴露给界面，出问题一眼看得出 |
| 开启逻辑加自动重试 | 刚启动时 possible 可能还没置位，会每 0.4 秒重试 6 次，并把原因写出来 |
| 失败原因上屏 | delegate 的 `failedToStartPictureInPictureWithError` 会写进界面；不再只 print |
| 预览与画中画共用刷新 | 同屏预览也是实时渲染（不是截图），切后台进画中画后继续 |
| 首页改成产品样子 | 新增 `RingClockView`（SwiftUI Canvas 画的环形时钟：60 格刻度、进度弧、四色定位点、中心徽标），不再是干巴巴一行字 |
| 加了 App 图标 | `Assets.xcassets/AppIcon.appiconset/icon-1024.png`（1024×1024，环形时钟图案），不再是白板图标 |

## 目录

```
ios-pip/
├── project.yml                        XcodeGen 配置（也可手动建工程）
├── README.md
└── ClockPiP/
    ├── App.swift                      SwiftUI App 入口（后台时准备画中画）
    ├── ContentView.swift              首页：环形时钟、倒计时、画中画开关 + 同屏预览 + 状态诊断
    ├── RingClockView.swift            环形时钟（Canvas 矢量绘制，与小程序同一套设计）
    ├── PiPDisplayLayerView.swift      ★ 把画中画显示层挂到界面上（能开启画中画的前提）
    ├── Assets.xcassets/AppIcon…        App 图标（1024×1024）
    ├── PiPClockController.swift        画中画控制器：帧渲染 → SampleBuffer → PiP
    ├── ClockFrameRenderer.swift        把时间/倒计时画进 CVPixelBuffer（480×240）
    ├── SilenceAudioKeepAlive.swift     静音音频保活（后台不掉）
    ├── BeijingTime.swift               与小程序 utils/time.js 对齐的时间计算
    └── Info.plist                      UIBackgroundModes: audio
```

## 时间算法一致性

| 小程序 | iOS |
| --- | --- |
| `parts(ms,'beijing')` | `BeijingTime.now(source: "beijing")` |
| `formatClock(p)` → `HH:MM:SS.d` | `BeijingTime.clockText(parts)` |
| `nextBeijing(h,m,s)` | `BeijingTime.nextBeijing(hour:minute:second:)` |
| `countdownParts()` → `时:分:秒:十分位` | `BeijingTime.countdownText(remain)` |

三端（小程序 / Android / iOS）都以 UTC+8 挂钟计算，不受手机时区影响，倒计时数字完全一致。

## 注意事项

- **画中画窗口的尺寸与位置由系统控制**（标准窗口约 2:1），内容按 480×240 渲染并自适应；这是系统行为，App 无法自定义成任意形状
- **必须由用户操作触发**进入画中画（点按钮，或开启后切后台自动进入）；iOS 不允许 App 在后台凭空弹出画中画
- 若系统内存紧张或用户手动关闭，重新打开 App 点一次即可
- **只能显示，不能点击**：画中画窗口可以浮在别的 App 之上，但系统不允许第三方 App 向其它应用派发点击手势 —— 想在 iPhone 上"到点自动点抢购按钮"是做不到的（这一点 Android 靠无障碍服务可以，iOS 不行）
- **上架风险**：App Store 审核对"非视频内容使用画中画"历来严格，自用（Xcode 直装 / TestFlight）没有问题
- 若要保持更长时间驻留，可在 Xcode → Signing & Capabilities 里确认 Background Modes 已勾选 Audio

## 已验证 / 未验证

**已静态验证**（本机无 macOS / Xcode，故未编译）：

- `Info.plist` 可通过 XML 解析器，且包含 `UIBackgroundModes = [audio]`
- 5 个 Swift 文件括号配平（`{}` `()` `[]`）
- 跨文件类型引用齐全（`BeijingTime` / `ClockFrameRenderer` / `SilenceAudioKeepAlive` / `PiPClockController`）
- `project.yml` 引用的 `ClockPiP` 源码目录与 `Info.plist` 均存在
- 用到的 API 均为 iOS 15+ 的公开 API（`ContentSource` / `AVPictureInPictureSampleBufferPlaybackDelegate`），部署目标 17.0

**未验证**：编译与真机运行（需要 macOS + Xcode + iPhone）。到 Xcode 里 Run 一次即可确认；`failedToStartPictureInPictureWithError` 会打印失败原因。