# Abre o FlightGear para voar AO VIVO com a plataforma (física ligada):
#   --generic   saída UDP a 60 Hz para "python fg-bridge.py --cueing" (protocolo em fgdata/Protocol)
#   --httpd     API HTTP usada pelo servidor MCP do FlightGear e pelo fly-demo.py
#   --telnet    usado pela ponte antiga (interface /antigo)
#   -View       câmera inicial; padrão 2 = Chase View (terceira pessoa, atrás do avião), para quem
#               assiste ver a orientação do avião de fora. 0 = cabine, 1 = helicóptero (órbita livre)
# Para só reproduzir um voo gravado, use o botão "Rodar no FlightGear" nas telas Simulador de voo
# ou Orientação do avião: o backend abre o FlightGear sozinho. Passo a passo em FLIGHTGEAR-SETUP.md.
#   -Runway     pista de partida; padrão 27R (a do voo de demonstração, circuito pela esquerda sobre a cidade)
#   -TimeOfDay  noon (padrão), morning, afternoon, dusk... ou real (hora local, que à noite não mostra nada)
# Uso: .\start-flightgear-cueing.ps1 [-Aircraft erj145] [-Airport SBGR] [-Runway 27R] [-TimeOfDay noon] [-View 2] [outros args do fgfs]
param(
    [string]$Aircraft = "erj145",
    [string]$Airport = "SBGR",
    [string]$Runway = "27R",
    [string]$TimeOfDay = "noon",
    [int]$UdpPort = 5510,
    [int]$HttpPort = 8080,
    [int]$TelnetPort = 5050,
    [int]$View = 2,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Extra = @()
)

$fgfs = $env:FGFS
if (-not $fgfs) {
    $entry = Get-ItemProperty HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*, HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\* -ErrorAction SilentlyContinue |
        Where-Object DisplayName -match "FlightGear" | Sort-Object DisplayVersion -Descending | Select-Object -First 1
    if ($entry) { $fgfs = Join-Path $entry.InstallLocation "bin\fgfs.exe" }
}
if (-not $fgfs -or -not (Test-Path $fgfs)) {
    Write-Error "fgfs.exe não encontrado. Instale com 'winget install FlightGear.FlightGear' ou defina `$env:FGFS. Veja FLIGHTGEAR-SETUP.md."
    exit 1
}

$data = Join-Path $PSScriptRoot "fgdata"
$fgArgs = @(
    "--data=$data",
    "--generic=socket,out,60,127.0.0.1,$UdpPort,udp,stewart-cueing",
    "--httpd=$HttpPort",
    "--telnet=$TelnetPort",
    "--aircraft=$Aircraft",
    "--airport=$Airport",
    "--timeofday=$TimeOfDay",
    "--prop:/sim/current-view/view-number=$View"
)

if ($Runway -and $Airport -eq "SBGR") { $fgArgs += "--runway=$Runway" }

if ($Aircraft -eq "erj145") {
    # ERJ145 instalado pelo launcher (Downloads\Aircraft) ou à mão (Custom Aircraft)
    $roots = @(Get-ChildItem (Join-Path $HOME "FlightGear\Downloads\Aircraft\*\Aircraft") -Directory -ErrorAction SilentlyContinue) +
             @(Get-Item (Join-Path $HOME "FlightGear\Custom Aircraft") -ErrorAction SilentlyContinue)
    $acDir = $roots | ForEach-Object { Join-Path $_.FullName "Embraer-ERJ-145" } |
        Where-Object { Test-Path (Join-Path $_ "erj145-set.xml") } | Select-Object -First 1
    if (-not $acDir) {
        Write-Error "ERJ145 não encontrado. No launcher do FlightGear, aba Aircraft, instale o 'Embraer ERJ 145'. Veja FLIGHTGEAR-SETUP.md."
        exit 1
    }
    # pintura do IFSP (a mesma que o backend instala)
    $liveries = Join-Path $acDir "Models\Liveries"
    New-Item -ItemType Directory -Force (Join-Path $liveries "2048x2048") | Out-Null
    Copy-Item (Join-Path $PSScriptRoot "assets\ifsp.xml") $liveries -Force
    Copy-Item (Join-Path $PSScriptRoot "assets\ifsp-flightgear-livery.png") (Join-Path $liveries "2048x2048") -Force
    $fgArgs += @("--aircraft-dir=$acDir", "--prop:/sim/model/livery/name=Instituto Federal")
} elseif ($Aircraft -eq "c172p") {
    # c172p: "auto" liga o motor e deixa pronto para decolar
    $fgArgs += "--state=auto"
}

if ($env:FG_ROOT) { $fgArgs = @("--fg-root=$env:FG_ROOT") + $fgArgs }
$fgArgs += $Extra

# argumentos com espaço ("Instituto Federal") precisam de aspas no Start-Process
$quoted = $fgArgs | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }
Write-Host "Iniciando $fgfs $($quoted -join ' ')"
Start-Process -FilePath $fgfs -ArgumentList $quoted -WorkingDirectory (Split-Path $fgfs)
