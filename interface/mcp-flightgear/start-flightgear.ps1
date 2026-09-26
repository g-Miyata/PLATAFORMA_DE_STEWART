# Abre o FlightGear com a API HTTP (usada pelo servidor MCP) e o Telnet (usado pelo fg-bridge.py).
# Uso: .\start-flightgear.ps1 [-HttpPort 8080] [-TelnetPort 5050] [-Aircraft c172p] [-Airport SBGR] [outros args do fgfs]
param(
    [int]$HttpPort = 8080,
    [int]$TelnetPort = 5050,
    [string]$Aircraft = "c172p",
    [string]$Airport = "",
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Extra = @()
)

$fgfs = $env:FGFS
if (-not $fgfs) {
    $entry = Get-ItemProperty HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*, HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\* -ErrorAction SilentlyContinue |
        Where-Object DisplayName -match "FlightGear" | Sort-Object DisplayVersion -Descending | Select-Object -First 1
    if ($entry) { $fgfs = Join-Path $entry.InstallLocation "bin\fgfs.exe" }
}
if (-not $fgfs -or -not (Test-Path $fgfs)) {
    Write-Error "fgfs.exe não encontrado. Instale com 'winget install FlightGear.FlightGear' ou defina `$env:FGFS."
    exit 1
}

# FGData: usa FG_ROOT se definido; senão, a pasta extraída ao lado dos downloads do FlightGear.
$fgRoot = $env:FG_ROOT
if (-not $fgRoot) { $fgRoot = Join-Path $HOME "FlightGear\fgdata_2024_1" }

$fgArgs = @("--httpd=$HttpPort", "--telnet=$TelnetPort", "--aircraft=$Aircraft")
if (Test-Path (Join-Path $fgRoot "version")) { $fgArgs = @("--fg-root=$fgRoot") + $fgArgs }
if ($Airport) { $fgArgs += "--airport=$Airport" }
$fgArgs += $Extra

Write-Host "Iniciando $fgfs $($fgArgs -join ' ')"
Start-Process -FilePath $fgfs -ArgumentList $fgArgs -WorkingDirectory (Split-Path $fgfs)
