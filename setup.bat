@echo off
chcp 65001 >nul
title WordWise Setup
echo ================================
echo   WordWise 一键安装脚本
echo ================================
echo.
cd /d "%~dp0"

:: Check if node exists in this folder or PATH
set "NODE_EXE="
if exist "%~dp0nodejs\node.exe" set "NODE_EXE=%~dp0nodejs\node.exe"
if "%NODE_EXE%"=="" where node >nul 2>nul && set "NODE_EXE=node"

:: If node not found, download portable Node.js
if "%NODE_EXE%"=="" (
    echo Node.js not found. Downloading portable Node.js...
    echo.

    :: Create nodejs directory
    if not exist "%~dp0nodejs" mkdir "%~dp0nodejs"

    :: Download Node.js portable zip
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/latest-v22.x/node-v22.23.0-win-x64.zip' -OutFile '%TEMP%\node-portable.zip'" 2>nul
    if %ERRORLEVEL% NEQ 0 (
        echo Download failed! Please install Node.js manually:
        echo   https://nodejs.org/
        pause
        exit /b 1
    )

    :: Extract
    echo Extracting...
    powershell -Command "Expand-Archive -Path '%TEMP%\node-portable.zip' -DestinationPath '%TEMP%\node-extract' -Force" 2>nul

    :: Move to local folder
    xcopy /E /Y "%TEMP%\node-extract\node-v22.23.0-win-x64\*" "%~dp0nodejs\" >nul 2>nul

    :: Cleanup
    del "%TEMP%\node-portable.zip" >nul 2>nul
    rmdir /S /Q "%TEMP%\node-extract" >nul 2>nul

    set "NODE_EXE=%~dp0nodejs\node.exe"
    echo Node.js installed to: %~dp0nodejs
) else (
    echo Node.js found: %NODE_EXE%
)

echo.
echo Installing dependencies...
cd /d "%~dp0"

:: Set PATH so npm.cmd can find node.exe
set "PATH=%~dp0nodejs;%PATH%"
call "%~dp0nodejs\npm.cmd" install --registry=https://registry.npmmirror.com 2>nul
if %ERRORLEVEL% NEQ 0 (
    call "%~dp0nodejs\npm.cmd" install
)

echo.
echo ================================
echo   Setup complete!
echo ================================
echo.
echo Run start.bat to start the server
echo.
pause
