@echo off
setlocal

REM Caminho base do projeto
set "PROJECT_DIR=%~dp0"

echo Iniciando servidor estatico para o frontend (porta 8080)...
start "Frontend" cmd /K "cd /d %PROJECT_DIR%interface\frontend && python -m http.server 8080"

echo Iniciando backend FastAPI (porta 8001)...
start "FastAPI" cmd /K "cd /d %PROJECT_DIR%interface\backend && python -m uvicorn app:app --reload --host 0.0.0.0 --port 8001"

echo.
echo Backend: http://localhost:8001/docs
echo Frontend: http://localhost:8080/index.html
echo.
echo Pressione qualquer tecla para encerrar este script (os servidores permanecem abertos nas janelas iniciadas).
pause >nul

endlocal
