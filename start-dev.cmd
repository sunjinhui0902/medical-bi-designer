@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo ===================================================
echo   医疗 BI 设计器 与 知识资产中心 正在启动...
echo   访问地址: http://127.0.0.1:5174/knowledge
echo ===================================================

start http://127.0.0.1:5174/knowledge
npm run dev
if errorlevel 1 (
  echo.
  echo Medical BI Designer 启动失败，请检查上方错误。
  pause
  exit /b 1
)

endlocal
