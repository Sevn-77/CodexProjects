@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 goto use_py
where python >nul 2>nul
if not errorlevel 1 goto use_python
echo 未找到 Python。请安装 Python，或直接双击 index.html 打开。
pause
exit /b 1

:use_py
echo Creator OS 正在启动，请保持此窗口打开。
echo 浏览器访问：http://localhost:8000
echo 按 Ctrl+C 可停止服务。
py -m http.server 8000 --bind 127.0.0.1
goto end

:use_python
echo Creator OS 正在启动，请保持此窗口打开。
echo 浏览器访问：http://localhost:8000
echo 按 Ctrl+C 可停止服务。
python -m http.server 8000 --bind 127.0.0.1

:end
