@echo off
setlocal

REM Caminho base do projeto
set "PROJECT_DIR=%~dp0"
set "BACKEND_DIR=%PROJECT_DIR%interface\backend"
set "FRONTEND_FILE=%PROJECT_DIR%interface\frontend\index.html"
set "VENV_DIR=%BACKEND_DIR%\.venv"
set "PYTHON_EXE=%VENV_DIR%\Scripts\python.exe"
set "REQ_FILE=%BACKEND_DIR%\requirements.txt"

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

REM Tenta encontrar Python pelo comando python
python --version >nul 2>nul
if not errorlevel 1 (
	set "PYTHON_BOOTSTRAP=python"
	goto python_found
)

REM Se nao encontrar python, tenta o launcher py
py --version >nul 2>nul
if not errorlevel 1 (
	set "PYTHON_BOOTSTRAP=py"
	goto python_found
)

echo Python nao encontrado.
echo.
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
echo Python encontrado usando comando: %PYTHON_BOOTSTRAP%

%PYTHON_BOOTSTRAP% -c "import sys; raise SystemExit(0 if (3, 12) <= sys.version_info[:2] < (3, 13) else 1)" >nul 2>nul
if errorlevel 1 (
	echo Versao de Python nao suportada.
	echo.
	echo Este projeto suporta apenas Python 3.12.x.
	echo Verifique com: %PYTHON_BOOTSTRAP% --version
	echo.
	pause
	exit /b 1
)

if not exist "%PYTHON_EXE%" (
	echo Criando ambiente virtual em %VENV_DIR%...
	%PYTHON_BOOTSTRAP% -m venv "%VENV_DIR%"
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

echo Abrindo frontend no navegador...
if exist "%FRONTEND_FILE%" (
	start "" "%FRONTEND_FILE%"
) else (
	echo Frontend nao encontrado:
	echo %FRONTEND_FILE%
)

echo.
echo Backend: http://localhost:8001/docs
echo Frontend: %FRONTEND_FILE%
echo.
echo Pressione qualquer tecla para encerrar este script.
echo O backend permanece aberto na janela iniciada.
pause >nul

endlocal
