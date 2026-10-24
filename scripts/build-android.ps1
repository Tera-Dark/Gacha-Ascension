param([switch]$Install, [switch]$Release)
$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
$androidPath = Join-Path $repoPath 'android'
if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT -and -not (Test-Path (Join-Path $androidPath 'local.properties'))) {
    $sdkPath = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
    if (-not (Test-Path $sdkPath)) { throw 'Set ANDROID_HOME to an Android SDK with platform 35 and build tools installed.' }
    $env:ANDROID_HOME = $sdkPath
}
$buildVariant = if ($Release) { 'Release' } else { 'Debug' }
& (Join-Path $androidPath 'gradlew.bat') -p $androidPath "assemble$buildVariant" "lint$buildVariant"
if ($LASTEXITCODE -ne 0) { throw 'Android build or lint failed.' }
$variantPath = $buildVariant.ToLowerInvariant()
$apkPath = Join-Path $androidPath "app\build\outputs\apk\$variantPath\app-$variantPath.apk"
# Verify that every bundled game byte matches the canonical source; never ship a stale copy.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($apkPath)
try {
    $gameEntries = @($archive.Entries | Where-Object { $_.FullName.StartsWith('assets/game/') -and $_.Length -gt 0 })
    if ($gameEntries.Count -lt 40) { throw 'Incomplete game assets in APK.' }
    foreach ($entry in $gameEntries) {
        $relativePath = $entry.FullName.Substring('assets/game/'.Length)
        if ($relativePath -match 'concept-reference|^tests/|^src/m0/') { throw "Unexpected runtime asset: $relativePath" }
        $sourcePath = Join-Path $repoPath $relativePath
        if (-not (Test-Path -LiteralPath $sourcePath)) { throw "Missing source asset: $relativePath" }
        $stream = $entry.Open()
        $hash = [Security.Cryptography.SHA256]::Create()
        try { $packedHash = [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '') }
        finally { $stream.Dispose(); $hash.Dispose() }
        $sourceStream = [IO.File]::OpenRead($sourcePath)
        $sourceHash = [Security.Cryptography.SHA256]::Create()
        try { $expectedHash = [BitConverter]::ToString($sourceHash.ComputeHash($sourceStream)).Replace('-', '') }
        finally { $sourceStream.Dispose(); $sourceHash.Dispose() }
        if ($packedHash -ne $expectedHash) { throw "Stale bundled asset: $relativePath" }
    }
    foreach ($required in @('preview-v0.8.html', 'src/v8/ui.mjs', 'data/v8-slice.json', 'assets/pixel/hero/portrait.png', 'assets/pixel/wolf/portrait.png')) {
        if (-not $archive.GetEntry("assets/game/$required")) { throw "Missing APK asset: $required" }
    }
} finally { $archive.Dispose() }
$outputPath = Join-Path $repoPath 'dist\android'
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
$version = (Get-Content (Join-Path $repoPath 'package.json') -Raw | ConvertFrom-Json).version
$suffix = if ($Release) { '-taptap' } else { '' }
$deliverablePath = Join-Path $outputPath "Gacha-Ascension-$version$suffix.apk"
$sdkPath = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$buildTools = Get-ChildItem -LiteralPath (Join-Path $sdkPath 'build-tools') -Directory | Sort-Object Name -Descending | Select-Object -First 1
$signer = Join-Path $buildTools.FullName 'apksigner.bat'
$signature = & $signer verify --verbose --print-certs $apkPath
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
if ($Release -and (($signature -join "`n") -match 'CN=Android Debug')) { throw 'Public APK must not use the Android debug certificate.' }
Write-Host ($signature -join "`n")
Copy-Item -LiteralPath $apkPath -Destination $deliverablePath -Force
Write-Host "Verified $($gameEntries.Count) game assets. APK: $deliverablePath"
if ($Install) {
    $sdkPath = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
    & (Join-Path $sdkPath 'platform-tools\adb.exe') install -r $deliverablePath
    if ($LASTEXITCODE -ne 0) { throw 'APK built, but device installation failed. Check USB debugging and adb devices.' }
}
