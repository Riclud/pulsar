# Pulsar bootstrap for Windows: installs the CLI from GitHub Releases, then the
# toolchain with `pulsar install`. Bun is inside the CLI.
# Set PULSAR_SLIM=1 for a toolchain that uses the system Qt.
$ErrorActionPreference = "Stop"

$Repo = if ($env:PULSAR_REPO) { $env:PULSAR_REPO } else { "riclud/pulsar" }
$Home_ = if ($env:PULSAR_HOME) { $env:PULSAR_HOME } else { Join-Path $env:LOCALAPPDATA "pulsar" }
$BinDir = if ($env:PULSAR_BIN_DIR) { $env:PULSAR_BIN_DIR } else { Join-Path $env:LOCALAPPDATA "pulsar\bin" }

$arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
$platform = "windows-$arch"

$asset = "pulsar-cli-$platform.tar.gz"
$url = "https://github.com/$Repo/releases/latest/download/$asset"
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("pulsar-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null

try {
    Write-Host "pulsar: downloading $asset"
    $archive = Join-Path $tmp $asset
    Invoke-WebRequest -Uri $url -OutFile $archive

    $stage = Join-Path $tmp "stage"
    New-Item -ItemType Directory -Path $stage | Out-Null
    tar -xzf $archive -C $stage
    if ($LASTEXITCODE -ne 0) { throw "could not extract $asset" }

    $pkg = Get-Content (Join-Path $stage "cli\package.json") -Raw | ConvertFrom-Json
    $version = $pkg.version
    if (-not $version) { throw "could not determine the CLI version" }

    $dest = Join-Path $Home_ "versions\$version"
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    Copy-Item -Path (Join-Path $stage "*") -Destination $dest -Recurse -Force

    $current = Join-Path $Home_ "current"
    if (Test-Path $current) { Remove-Item -Recurse -Force $current }
    New-Item -ItemType Junction -Path $current -Target (Join-Path $Home_ "versions\$version") | Out-Null

    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
    $shim = Join-Path $BinDir "pulsar.cmd"
    $binary = Join-Path $current "bin\pulsar.exe"

    # Releases from 2.0 carry bin\pulsar.exe with Bun inside; older ones need a system Bun.
    if (Test-Path $binary) {
        $command = @($binary)
        "@echo off`r`n `"$binary`" %*" | Set-Content -Encoding ASCII $shim
    } else {
        if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
            throw "pulsar: this release needs Bun; install it from https://bun.sh and re-run"
        }

        $command = @("bun", (Join-Path $current "cli\index.ts"))
        "@echo off`r`n bun `"$current\cli\index.ts`" %*" | Set-Content -Encoding ASCII $shim
    }

    Write-Host "pulsar: installed $version to $dest"
    Write-Host "  binary: $shim"
    Write-Host "  add $BinDir to PATH if needed"

    $toolchainArgs = @($command | Select-Object -Skip 1) + @("install")
    if ($env:PULSAR_SLIM -eq "1") { $toolchainArgs += "--slim" }

    & $command[0] $toolchainArgs

    if ($LASTEXITCODE -ne 0) { throw "pulsar: toolchain install failed" }
}
finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
