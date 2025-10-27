@echo off
echo ========================================
echo  Stewart Platform - PID Control
echo  Iniciando Backend...
echo ========================================
echo.

cd /d "%~dp0backend"
python app.py

pause
