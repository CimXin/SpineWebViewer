@echo off
cd /d "%~dp0"
where py >nul 2>nul && py -3 "%~dp0serve.py" && goto :eof
where python >nul 2>nul && python "%~dp0serve.py" && goto :eof
where python3 >nul 2>nul && python3 "%~dp0serve.py" && goto :eof
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
