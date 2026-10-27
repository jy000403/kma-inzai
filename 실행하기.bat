@echo off
chcp 949 > nul
title KMA 프로젝트
cd /d "%~dp0"

rem 이 PC 에서 서버를 띄우고 브라우저를 여는 바로가기입니다.
rem 꼭 이것이 아니어도 됩니다 - 명령창에서 python relay.py 로 켜도 똑같습니다.
rem PPT, 엑셀, 메일은 이제 오피스를 부르지 않고 파일로 직접 만들므로
rem 배포한 웹에서도 같은 기능이 됩니다.

echo.
echo   KMA 프로젝트를 시작합니다...
echo   이 창을 닫으면 종료됩니다.
echo.

where py >nul 2>&1
if %errorlevel%==0 (
  py relay.py
  goto :end
)

where python >nul 2>&1
if %errorlevel%==0 (
  python relay.py
  goto :end
)

echo.
echo   Python 이 설치되어 있지 않습니다.
echo   https://www.python.org/downloads/ 에서 설치한 뒤 다시 실행해 주세요.
echo   (설치하지 않고 쓰려면 배포한 웹 주소로 들어가면 됩니다)
echo.
pause
goto :eof

:end
echo.
echo   서버가 멈췄습니다.
pause