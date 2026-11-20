@echo off
title StudyMate AI - Control Panel
color 0B

:MENU
cls
echo ==================================================
echo          STUDYMATE AI - CONTROL PANEL
echo ==================================================
echo.
echo   [1] Update Frontend (npm run build)
echo   [2] Nyalakan Backend (npm start)
echo   [3] Matikan Backend (Stop Port 3000)
echo   [4] Update Frontend + Restart Backend
echo   ------------------------------------------------
echo   [5] Nyalakan Cloudflare Tunnel (Public URL)
echo   [6] Matikan Cloudflare Tunnel
echo   [7] Jalankan Semua (Build + Backend + Tunnel)
echo   [0] Keluar
echo.
echo ==================================================
set /p pilihan="Pilih menu (0-7): "

if "%pilihan%"=="1" goto BUILD_FRONTEND
if "%pilihan%"=="2" goto START_BACKEND
if "%pilihan%"=="3" goto STOP_BACKEND
if "%pilihan%"=="4" goto DEPLOY_ALL
if "%pilihan%"=="5" goto START_TUNNEL
if "%pilihan%"=="6" goto STOP_TUNNEL
if "%pilihan%"=="7" goto START_EVERYTHING
if "%pilihan%"=="0" exit

echo.
echo Pilihan tidak valid! Silakan tekan 0 - 7.
timeout /t 2 >nul
goto MENU

:BUILD_FRONTEND
cls
echo [1/1] Sedang mem-build Frontend (npm run build)...
echo ==================================================
cd /d "%~dp0"
call npm run build
echo.
echo ==================================================
echo Selesai! Frontend berhasil di-update.
pause
goto MENU

:START_BACKEND
cls
echo Menyalakan Backend di jendela baru (Port 3000)...
echo ==================================================
cd /d "%~dp0backend"
start "StudyMate-AI Backend" cmd /k "npm start"
echo.
echo Backend sudah dinyalakan di jendela terminal terpisah!
timeout /t 2 >nul
goto MENU

:STOP_BACKEND
cls
echo Mematikan Backend (Port 3000)...
echo ==================================================
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
taskkill /FI "WINDOWTITLE eq StudyMate-AI Backend*" /F >nul 2>&1
echo.
echo Backend berhasil dimatikan!
timeout /t 2 >nul
goto MENU

:DEPLOY_ALL
cls
echo [1/3] Mematikan Backend lama (jika aktif)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
taskkill /FI "WINDOWTITLE eq StudyMate-AI Backend*" /F >nul 2>&1

echo [2/3] Mem-build Frontend (npm run build)...
cd /d "%~dp0"
call npm run build

echo [3/3] Menyalakan ulang Backend...
cd /d "%~dp0backend"
start "StudyMate-AI Backend" cmd /k "npm start"
echo.
echo Semua selesai! Frontend terbaru sudah aktif di Backend.
timeout /t 2 >nul
goto MENU

:START_TUNNEL
cls
echo Menyalakan Cloudflare Tunnel ke http://localhost:3000...
echo ==================================================
start "StudyMate-AI Cloudflare Tunnel" cmd /k "cloudflared tunnel --url http://localhost:3000"
echo.
echo Jendela Cloudflare Tunnel terbuka! Salin link *.trycloudflare.com dari sana.
timeout /t 2 >nul
goto MENU

:STOP_TUNNEL
cls
echo Mematikan Cloudflare Tunnel...
echo ==================================================
taskkill /IM cloudflared.exe /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq StudyMate-AI Cloudflare Tunnel*" /F >nul 2>&1
echo.
echo Cloudflare Tunnel berhasil dimatikan!
timeout /t 2 >nul
goto MENU

:START_EVERYTHING
cls
echo [1/4] Membersihkan Backend & Tunnel lama...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
taskkill /FI "WINDOWTITLE eq StudyMate-AI Backend*" /F >nul 2>&1
taskkill /IM cloudflared.exe /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq StudyMate-AI Cloudflare Tunnel*" /F >nul 2>&1

echo [2/4] Mem-build Frontend (npm run build)...
cd /d "%~dp0"
call npm run build

echo [3/4] Menyalakan Backend (Port 3000)...
cd /d "%~dp0backend"
start "StudyMate-AI Backend" cmd /k "npm start"
timeout /t 3 >nul

echo [4/4] Menyalakan Cloudflare Tunnel...
start "StudyMate-AI Cloudflare Tunnel" cmd /k "cloudflared tunnel --url http://localhost:3000"
echo.
echo ==================================================
echo Semua layanan aktif! Cek jendela Tunnel untuk URL publik.
timeout /t 3 >nul
goto MENU