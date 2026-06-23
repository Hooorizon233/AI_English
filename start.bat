@echo off
chcp 65001 >nul
title WordWise Server v4.0
echo ================================
echo   WordWise 英语背单词服务端
echo   http://localhost:3000
echo ================================
echo.
cd /d "%~dp0"

:: Auto-detect Node.js: local folder first, then system PATH
set "NODE_EXE="
if exist "%~dp0nodejs\node.exe" (
    set "NODE_EXE=%~dp0nodejs\node.exe"
) else if exist "C:\Users\Administrator\node-v22.23.0-win-x64\node.exe" (
    set "NODE_EXE=C:\Users\Administrator\node-v22.23.0-win-x64\node.exe"
) else (
    where node >nul 2>nul && set "NODE_EXE=node"
)

if "%NODE_EXE%"=="" (
    echo Node.js not found!
    echo Please run setup.bat first to install Node.js
    pause
    exit /b 1
)

echo Node: %NODE_EXE%
echo Port: 3000
echo.

"%NODE_EXE%" server.js

pause
