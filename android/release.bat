@echo off
rem Gera o APK e o AAB de release ASSINADOS em android\release\
rem
rem Uso:   release.bat [versionCode] [versionName] [chave-do-youtube]
rem Ex.:   release.bat 2 1.1 AIza...suaChave
rem
rem - versionCode: numero inteiro que PRECISA ser maior a cada envio para a Play (padrao 1)
rem - versionName: texto que o usuario ve (padrao 1.0)
rem - chave: se informada, entra no app (o app passa a se atualizar sozinho). Sem ela, usa so o snapshot.
setlocal
cd /d "%~dp0"

if not exist keystore.properties (
  echo ERRO: falta o arquivo keystore.properties ^(e a chave em signing\^). Veja PLAY-STORE.md.
  exit /b 1
)
if "%JAVA_HOME%"=="" if exist "C:\Program Files\Android\Android Studio\jbr" set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"

set "VC=%~1"
set "VN=%~2"
set "KEY=%~3"
if "%VC%"=="" set "VC=1"
if "%VN%"=="" set "VN=1.0"
if not "%KEY%"=="" set "YOUTUBE_API_KEY=%KEY%"

echo [1/3] Montando o site dentro do app...
call node "%~dp0build-web.js"
if errorlevel 1 exit /b 1

echo [2/3] Compilando e assinando (versionCode %VC%, versionName %VN%)...
call "%~dp0gradlew.bat" assembleRelease bundleRelease -PversionCode=%VC% -PversionName=%VN%
if errorlevel 1 exit /b 1

echo [3/3] Copiando para a pasta release\ ...
if not exist release mkdir release
copy /y app\build\outputs\apk\release\app-release.apk "release\NNPlayTV-%VN%-%VC%.apk" >nul
copy /y app\build\outputs\bundle\release\app-release.aab "release\NNPlayTV-%VN%-%VC%.aab" >nul

echo.
echo Pronto:
echo   release\NNPlayTV-%VN%-%VC%.aab   ^(envie este para a Play Store^)
echo   release\NNPlayTV-%VN%-%VC%.apk   ^(para instalar direto na TV com adb^)
endlocal
