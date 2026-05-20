@echo off
setlocal

REM Caminho base do projeto
set "PROJECT_DIR=%~dp0"
set "BACKEND_DIR=%PROJECT_DIR%interface\backend"
set "PYTHON_EXE=%BACKEND_DIR%\.venv\Scripts\python.exe"

if not exist "%PYTHON_EXE%" (
	echo Ambiente virtual nao encontrado.
	echo Execute primeiro o start.bat.
	pause
	exit /b 1
)

if not exist "%BACKEND_DIR%" (
	echo Pasta do backend nao encontrada:
	echo %BACKEND_DIR%
	pause
	exit /b 1
)

cd /d "%BACKEND_DIR%" || (
	echo Nao foi possivel acessar a pasta do backend.
	pause
	exit /b 1
)

echo Iniciando FastAPI em http://localhost:8001/docs
"%PYTHON_EXE%" -m uvicorn app:app --reload --host 0.0.0.0 --port 8001

pause