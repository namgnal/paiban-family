@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js。请安装 Node.js 22.12 或更新版本后重试。
  pause
  exit /b 1
)
node scripts/serve.mjs
pause
