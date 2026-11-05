@echo off
title HOFIS - Synchronize Students from Book1.xlsx
echo ==========================================================
echo  Holy Family International School (HOFIS)
echo  Synchronizing Student Registry from Book1.xlsx...
echo ==========================================================
echo.

powershell -ExecutionPolicy Bypass -File "backend\scripts\syncExcel.ps1"

echo.
echo ==========================================================
echo  Press any key to exit.
echo ==========================================================
pause >nul

