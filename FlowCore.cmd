@echo off
chcp 65001 >nul
title FlowCore
cd /d "%~dp0"

where python >nul 2>nul
if not errorlevel 1 goto run_python
where py >nul 2>nul
if not errorlevel 1 goto run_py

echo.
echo Python 3 not found. Install it from https://www.python.org/downloads/
echo and tick "Add python.exe to PATH", then double-click this file again.
echo.
pause
exit /b 1

:run_py
set "PYTHON=py"
goto start
:run_python
set "PYTHON=python"
:start

"%PYTHON%" serve.py --tunnel --copy
echo.
echo FlowCore stopped. Press any key to close.
pause >nul
