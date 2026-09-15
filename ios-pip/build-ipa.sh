#!/usr/bin/env bash
# 一条命令出 IPA。必须在 macOS 上运行（Windows/Linux 没有 iOS 工具链）。
#
#   ./build-ipa.sh                          # 未签名 IPA（给 Sideloadly / AltStore 重签用）
#   TEAM_ID=ABCDE12345 ./build-ipa.sh       # 用你的开发者团队签名，直接出可安装的 IPA
#
# 产物：
#   build/ClockPiP-unsigned.ipa   —— 未签名，体积最小，交给重签工具
#   build/ClockPiP.ipa            —— 已签名（只在给了 TEAM_ID 时产出）
set -euo pipefail

cd "$(dirname "$0")"

PROJECT_NAME="ClockPiP"
SCHEME="ClockPiP"
BUILD_DIR="build"
ARCHIVE_PATH="$BUILD_DIR/$PROJECT_NAME.xcarchive"
EXPORT_DIR="$BUILD_DIR/export"

echo "==> 检查工具链"
command -v xcodebuild >/dev/null 2>&1 || { echo "找不到 xcodebuild：请在 macOS 上运行（先装 Xcode）"; exit 1; }
command -v xcrun >/dev/null 2>&1 || { echo "找不到 xcrun：请运行 sudo xcode-select -s /Applications/Xcode.app"; exit 1; }

echo "==> 生成 Xcode 工程"
if [ ! -d "$PROJECT_NAME.xcodeproj" ]; then
  if command -v xcodegen >/dev/null 2>&1; then
    xcodegen generate
  else
    echo "没有工程文件，也没装 xcodegen。先执行： brew install xcodegen"
    exit 1
  fi
fi

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo "==> 归档（Release / iphoneos）"
# 优先用 scheme；万一工程里没有共享 scheme 就退回 -target，别白跑一趟
TARGET_MODE=0
if ! xcodebuild -list -project "$PROJECT_NAME.xcodeproj" | grep -q "^    $SCHEME$"; then
  echo "    !! 工程里没有 scheme $SCHEME，退回 -target 归档"
  TARGET_MODE=1
fi
if [ "$TARGET_MODE" = "1" ]; then
  SCOPE="-target $SCHEME -sdk iphoneos"
else
  SCOPE="-scheme $SCHEME -destination generic/platform=iOS"
fi

if [ -n "${TEAM_ID:-}" ]; then
  echo "    签名团队：$TEAM_ID"
  # shellcheck disable=SC2086
  xcodebuild archive \
    -project "$PROJECT_NAME.xcodeproj" \
    $SCOPE \
    -configuration Release \
    -archivePath "$ARCHIVE_PATH" \
    DEVELOPMENT_TEAM="$TEAM_ID" \
    CODE_SIGN_STYLE=Automatic \
    -allowProvisioningUpdates
else
  echo "    未指定 TEAM_ID，出未签名包"
  # shellcheck disable=SC2086
  xcodebuild archive \
    -project "$PROJECT_NAME.xcodeproj" \
    $SCOPE \
    -configuration Release \
    -archivePath "$ARCHIVE_PATH" \
    CODE_SIGNING_ALLOWED=NO \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGN_IDENTITY=""
fi

APP_PATH="$ARCHIVE_PATH/Products/Applications/$PROJECT_NAME.app"
[ -d "$APP_PATH" ] || { echo "归档里没有找到 $PROJECT_NAME.app：$APP_PATH"; exit 1; }

if [ -n "${TEAM_ID:-}" ]; then
  echo "==> 导出已签名 IPA"
  cat > "$BUILD_DIR/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>development</string>
    <key>teamID</key>
    <string>$TEAM_ID</string>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>compileBitcode</key>
    <false/>
    <key>stripSwiftSymbols</key>
    <true/>
</dict>
</plist>
PLIST
  xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$EXPORT_DIR" \
    -exportOptionsPlist "$BUILD_DIR/ExportOptions.plist" \
    -allowProvisioningUpdates \
    | tail -n 20
  echo "==> 完成：$(pwd)/$EXPORT_DIR/$PROJECT_NAME.ipa"
else
  echo "==> 打成未签名 IPA"
  rm -rf "$BUILD_DIR/Payload"
  mkdir -p "$BUILD_DIR/Payload"
  cp -R "$APP_PATH" "$BUILD_DIR/Payload/"
  ( cd "$BUILD_DIR" && zip -qry "$PROJECT_NAME-unsigned.ipa" Payload )
  rm -rf "$BUILD_DIR/Payload"
  echo "==> 完成：$(pwd)/$BUILD_DIR/$PROJECT_NAME-unsigned.ipa"
  echo "    用 Sideloadly / AltStore 安装时会用你的 Apple ID 重新签名："
  echo "    - 免费 Apple ID：装完 7 天后要重签一次"
  echo "    - 付费开发者账号：有效期 1 年"
fi

echo "==> 顺手校验一下 Info.plist"
plutil -lint "$(pwd)/$PROJECT_NAME/ClockPiP/Info.plist" 2>/dev/null || true
