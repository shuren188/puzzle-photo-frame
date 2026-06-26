@echo off
chcp 65001 >nul
title 拼图裁剪加相框 - 一键部署

echo ========================================
echo   拼图裁剪加相框 - GitHub Pages 部署
echo ========================================
echo.

REM 构建
echo [1/4] 构建项目...
call npx vite build
if %errorlevel% neq 0 (
    echo [错误] 构建失败
    pause
    exit /b 1
)
echo [OK] 构建成功
echo.

REM 尝试用 gh-pages 推送（需要 HTTPS 直连）
echo [2/4] 尝试通过 gh-pages 推送...
call npx gh-pages -d dist -m "deploy: 自动部署" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] 通过 gh-pages 推送成功
    goto :DONE
) else (
    echo [!] gh-pages 推送失败，尝试通过 API 部署...
)

REM 检查 gh CLI 是否可用
where gh >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 需要安装 GitHub CLI (gh)
    echo 请访问 https://cli.github.com/
    pause
    exit /b 1
)

REM 通过 gh API 部署
echo [3/4] 通过 GitHub API 部署到 gh-pages...
call node deploy-api.js
if %errorlevel% neq 0 (
    echo [错误] API 部署失败
    pause
    exit /b 1
)

:DONE
echo.
echo ========================================
echo   ✅ 部署成功！
echo   访问地址:
echo   https://shuren188.github.io/puzzle-photo-frame/
echo ========================================
pause
