@echo off
cls
echo ==========================================
echo   BITUNIX - GitHub Push Script
echo ==========================================
echo.
echo This will push your code to GitHub
echo.

REM Check if git is installed
git --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git is not installed!
    echo Please install Git from: https://git-scm.com/download/win
    pause
    exit /b 1
)

echo [1/5] Checking Git... OK
echo.

REM Initialize git if not already done
if not exist .git (
    echo [2/5] Initializing Git repository...
    git init
) else (
    echo [2/5] Git already initialized... OK
)

echo.
echo [3/5] Adding files to Git...
git add .

echo.
echo [4/5] Committing changes...
git commit -m "Update: %date% %time%"

REM Check if remote exists
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo.
    echo ==========================================
    echo    FIRST TIME SETUP
    echo ==========================================
    echo.
    echo Please enter your GitHub repository URL:
    echo Example: https://github.com/username/bitunix.git
    set /p GITHUB_URL="GitHub URL: "
    
    git remote add origin %GITHUB_URL%
    git branch -M main
)

echo.
echo [5/5] Pushing to GitHub...
git push -u origin main

if errorlevel 1 (
    echo.
    echo [ERROR] Push failed!
    echo Make sure:
    echo - You have internet connection
    echo - Your GitHub URL is correct
    echo - You are logged into Git
    pause
    exit /b 1
)

echo.
echo ==========================================
echo    SUCCESS! Code pushed to GitHub
echo ==========================================
echo.
pause
