@echo off
title HOFIS - Synchronize Student Database
echo ==========================================================
echo  Holy Family International School (HOFIS)
echo  Synchronizing Student Database (Class playschool to X)
echo ==========================================================
echo.

node "backend\scripts\importStudents.js"

echo.
echo ==========================================================
echo  Press any key to exit.
echo ==========================================================
pause >nul

