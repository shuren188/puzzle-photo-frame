@echo off
chcp 65001 >nul
title 拼图裁剪加相框 - 一键部署

echo ========================================
echo   拼图裁剪加相框 - GitHub Pages 部署
echo ========================================
echo.

REM 检查 git 是否可用
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 git，请先安装 https://git-scm.com
    pause
    exit /b 1
)

REM 检查是否有未提交的改动
git diff --quiet HEAD
if %errorlevel% neq 0 (
    echo [提示] 工作区有未提交的改动，先提交...
    git add -A
    git commit -m "deploy: %date% %time%"
)

REM 推送到 main
echo [1/3] 推送 main 分支...
git push origin main
if %errorlevel% neq 0 (
    echo [错误] main 推送失败，请检查网络连接
    pause
    exit /b 1
)
echo [OK] main 推送成功
echo.

REM 安装 gh-pages (如果还没有)
where npx >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js，请先安装 https://nodejs.org
    pause
    exit /b 1
)

echo [2/3] 安装部署工具...
call npm install --save-dev gh-pages >nul 2>&1

REM 部署到 gh-pages
echo [3/3] 部署到 GitHub Pages...
call npx gh-pages -d dist -m "deploy: v1.0 - 基于拼图裁剪改造，准备添加相框"
if %errorlevel% neq 0 (
    echo [错误] 部署失败
    pause
    exit /b 1
)
echo.
echo ========================================
echo   ✅ 部署成功！
echo   访问地址:
echo   https://shuren188.github.io/puzzle-photo-frame/
echo ========================================
pause
