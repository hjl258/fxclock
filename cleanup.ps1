<#
  悬浮时钟 · 清理脚本
  用途：删除已精简功能的页面目录与旧预览产物（沙箱环境禁止助手直接删除文件，因此由你执行一次）
  注意：pages\events 已恢复为「抢购事件」页（首页卡片点进去），不在删除范围内。

  用法（在本目录打开 PowerShell）：
    .\cleanup.ps1 -DryRun     # 只列出将要删除的内容，不做任何修改
    .\cleanup.ps1             # 执行删除

  安全约定：
    * 所有目标都是写死的字面路径，不做通配/枚举后删除；
    * 删除前逐个校验绝对路径必须位于本项目目录内，越界即中止；
    * 保留清单中的路径绝不删除。
#>
param([switch]$DryRun)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $PSScriptRoot).Path

if (-not (Test-Path -LiteralPath (Join-Path $root 'app.json') -PathType Leaf)) {
    throw "未找到 app.json，cleanup.ps1 必须位于小程序项目根目录（当前: $root）"
}

# 待删除：已移除功能的页面目录
$dirTargets = @(
    'pages\hot',
    'pages\tools'
)

# 待删除：已移除功能的旧预览产物
$fileTargets = @(
    'preview\clock-preview.html',
    'preview\clock-preview.png',
    'preview\clock-countdown.html',
    'preview\clock-countdown.png',
    'preview\hot.html',
    'preview\hot.png',
    'preview\tools.html',
    'preview\tools.png'
)

# 保留清单（即便误列入也不会被删）
$keep = @(
    'app.json', 'app.js', 'app.wxss', 'project.config.json', 'README.md',
    'pages\clock', 'pages\mine',
    'components\ring-clock', 'components\float-clock',
    'custom-tab-bar', 'utils',
    'preview\index.html', 'preview\build-preview.js',
    'preview\clock.html', 'preview\clock.png',
    'preview\clock-sheet.html', 'preview\clock-sheet.png',
    'preview\clock-float.html', 'preview\clock-float.png',
    'preview\mine.html', 'preview\mine.png'
)

function Assert-InProject([string]$candidate) {
    $full = [System.IO.Path]::GetFullPath($candidate)
    $prefix = $root + [System.IO.Path]::DirectorySeparatorChar
    if (-not $full.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "拒绝操作项目外路径: $full"
    }
    return $full
}

$removed = New-Object System.Collections.Generic.List[string]
$skipped = New-Object System.Collections.Generic.List[string]

Write-Host "项目根目录: $root" -ForegroundColor Cyan

foreach ($rel in $dirTargets) {
    if ($keep -contains $rel) { $skipped.Add("$rel（在保留清单中，跳过）"); continue }
    $full = Assert-InProject (Join-Path $root $rel)
    if (Test-Path -LiteralPath $full -PathType Container) {
        $files = @(Get-ChildItem -LiteralPath $full -Recurse -File -ErrorAction SilentlyContinue).Count
        if ($DryRun) {
            Write-Host ("[将删除] 目录 {0}（{1} 个文件）" -f $rel, $files) -ForegroundColor Yellow
        } else {
            Remove-Item -LiteralPath $full -Recurse -Force
            $removed.Add($rel)
            Write-Host ("[已删除] 目录 {0}" -f $rel) -ForegroundColor Green
        }
    } else {
        $skipped.Add("$rel（不存在）")
    }
}

foreach ($rel in $fileTargets) {
    if ($keep -contains $rel) { $skipped.Add("$rel（在保留清单中，跳过）"); continue }
    $full = Assert-InProject (Join-Path $root $rel)
    if (Test-Path -LiteralPath $full -PathType Leaf) {
        if ($DryRun) {
            Write-Host ("[将删除] 文件 {0}（{1} KB）" -f $rel, [math]::Round((Get-Item -LiteralPath $full).Length / 1KB)) -ForegroundColor Yellow
        } else {
            Remove-Item -LiteralPath $full -Force
            $removed.Add($rel)
            Write-Host ("[已删除] 文件 {0}" -f $rel) -ForegroundColor Green
        }
    } else {
        $skipped.Add("$rel（不存在）")
    }
}

Write-Host ''
if ($DryRun) {
    Write-Host "DryRun 结束：以上为将要删除的内容，本次未修改任何文件。" -ForegroundColor Cyan
} else {
    Write-Host ("清理完成：删除 {0} 项。" -f $removed.Count) -ForegroundColor Cyan
}

# 删除后结构核对
Write-Host "`n当前 pages\ 目录：" -ForegroundColor Cyan
Get-ChildItem -LiteralPath (Join-Path $root 'pages') -Directory | ForEach-Object { '  ' + $_.Name }
Write-Host "`n当前 preview\ 目录：" -ForegroundColor Cyan
Get-ChildItem -LiteralPath (Join-Path $root 'preview') | ForEach-Object { '  ' + $_.Name }

if ($skipped.Count) {
    Write-Host "`n跳过项：" -ForegroundColor DarkGray
    $skipped | ForEach-Object { Write-Host ('  - ' + $_) -ForegroundColor DarkGray }
}