@echo off
title HOFIS - Upload Students to AWS DynamoDB
echo ==========================================================
echo  Holy Family International School (HOFIS)
echo  Uploading Student Database (Class playschool to X)
echo  Total: 575 Students to AWS DynamoDB
echo ==========================================================
echo.
echo Note: Ensure you have run "aws configure" with your AWS
echo Access Key and Secret Key before running this script.
echo.

powershell -ExecutionPolicy Bypass -File "backend\scripts\seedDynamoDB.ps1"

echo.
echo ==========================================================
echo  Press any key to exit.
echo ==========================================================
pause >nul

