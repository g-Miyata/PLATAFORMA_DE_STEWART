@echo off
setlocal

REM Caminho base do projeto
set "PROJECT_DIR=%~dp0"
set "BACKEND_DIR=%PROJECT_DIR%interface\backend"
set "APP_URL=http://localhost:8001/"
set "VENV_DIR=%BACKEND_DIR%\.venv"
set "PYTHON_EXE=%VENV_DIR%\Scripts\python.exe"
set "REQ_FILE=%BACKEND_DIR%\requirements.txt"

REM "start.bat rede": abre tambem para o celular no mesmo Wi-Fi (HTTPS 8443 e PIN)
if /i "%~1"=="rede" set "STEWART_LAN=1"

if not exist "%BACKEND_DIR%" (
	echo Nao foi possivel localizar a pasta do backend:
	echo %BACKEND_DIR%
	pause
	exit /b 1
)

if not exist "%REQ_FILE%" (
	echo Arquivo requirements.txt nao encontrado:
	echo %REQ_FILE%
	pause
	exit /b 1
)

REM Valida o interpretador: CPython oficial para Windows, versao 3.12.x.
REM Rejeita Pythons embutidos em outros programas (ex.: Inkscape/MSYS2), que criam
REM o venv com layout "bin/" e quebram a instalacao.
set "PY_CHECK=import sys,sysconfig; ok=sysconfig.get_platform().startswith('win') and (3,12)<=sys.version_info[:2]<(3,13); raise SystemExit(0 if ok else 1)"

REM Procura em ordem: launcher "py" do PATH, launcher nos locais padrao, "python" do PATH
REM e as pastas padrao de instalacao da 3.12. Assim funciona mesmo num terminal aberto
REM antes da instalacao (PATH antigo) ou quando outro programa poe o proprio python na frente.
call :try_python "py" "-3.12" && goto python_found
call :try_python "%LOCALAPPDATA%\Programs\Python\Launcher\py.exe" "-3.12" && goto python_found
call :try_python "%WINDIR%\py.exe" "-3.12" && goto python_found
call :try_python "python" "" && goto python_found
call :try_python "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" "" && goto python_found
call :try_python "%ProgramFiles%\Python312\python.exe" "" && goto python_found

echo Python 3.12 oficial nao encontrado.
echo.
echo O "python" do PATH pode ser de outro programa (ex.: Inkscape) ou de outra versao.
echo Instale o Python 3.12.x antes de executar este projeto.
echo Link oficial:
echo https://www.python.org/downloads/
echo.
echo Durante a instalacao, marque a opcao:
echo Add python.exe to PATH
echo.
echo Depois feche e abra o terminal novamente e rode o start.bat.
echo.
pause
exit /b 1

:python_found
echo Python encontrado: %PY_EXE% %PY_ARGS%

if exist "%VENV_DIR%" if not exist "%PYTHON_EXE%" (
	echo O ambiente virtual existente e invalido ^(provavelmente criado por outro Python^):
	echo %VENV_DIR%
	echo.
	echo Apague essa pasta e execute o start.bat novamente.
	pause
	exit /b 1
)

if not exist "%PYTHON_EXE%" (
	echo Criando ambiente virtual em %VENV_DIR%...
	"%PY_EXE%" %PY_ARGS% -m venv "%VENV_DIR%"
	if errorlevel 1 (
		echo Erro ao criar ambiente virtual.
		pause
		exit /b 1
	)
)

echo Garantindo instalacao do pip...
"%PYTHON_EXE%" -m ensurepip --default-pip --upgrade
if errorlevel 1 (
	echo Erro ao instalar pip no ambiente virtual.
	echo.
	echo Tente apagar a pasta:
	echo %VENV_DIR%
	echo.
	echo Depois execute o start.bat novamente.
	pause
	exit /b 1
)

echo Atualizando pip...
"%PYTHON_EXE%" -m pip install --upgrade pip
if errorlevel 1 (
	echo Erro ao atualizar pip.
	pause
	exit /b 1
)

echo Instalando/verificando dependencias do backend...
"%PYTHON_EXE%" -m pip install -r "%REQ_FILE%"
if errorlevel 1 (
	echo Erro ao instalar dependencias.
	pause
	exit /b 1
)

if defined STEWART_SKIP_LAUNCH (
	echo Bootstrap concluido. Iniciacao dos servidores ignorada por STEWART_SKIP_LAUNCH.
	exit /b 0
)

echo Iniciando backend FastAPI na porta 8001...
start "FastAPI" "%PROJECT_DIR%run-backend.cmd"

echo Aguardando o backend responder...
powershell -NoProfile -Command "for($i=0;$i -lt 60;$i++){try{Invoke-WebRequest http://127.0.0.1:8001/api/info -UseBasicParsing -TimeoutSec 1 | Out-Null; exit 0}catch{Start-Sleep -Milliseconds 500}}; exit 1" >nul 2>nul
if errorlevel 1 (
	echo O backend nao respondeu em 30 s. Veja a janela "FastAPI" para detalhes.
)

REM O backend serve o frontend: abrir via http evita os bloqueios do file://
echo Abrindo interface no navegador...
start "" "%APP_URL%"

echo.
echo Interface: %APP_URL%
if defined STEWART_LAN (
	echo Modo rede local: veja na janela "FastAPI" o endereco para o celular e o PIN.
	echo Se o Windows perguntar, permita o Python em redes privadas.
)
echo Interface antiga: %APP_URL%antigo/
echo API: %APP_URL%docs
echo.
echo Pressione qualquer tecla para encerrar este script.
echo O backend permanece aberto na janela iniciada.
pause >nul

endlocal
exit /b 0

REM Testa um interpretador: %1 = executavel, %2 = argumentos (ex.: -3.12).
REM Sucesso: define PY_EXE/PY_ARGS e retorna 0.
:try_python
"%~1" %~2 -c "%PY_CHECK%" >nul 2>nul || exit /b 1
set "PY_EXE=%~1"
set "PY_ARGS=%~2"
exit /b 0
