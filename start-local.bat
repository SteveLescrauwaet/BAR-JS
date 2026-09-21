@echo off
cd /d "%~dp0"
echo JS Dottignies Bar - serveur local
 echo Ouvre ensuite http://localhost:8080 dans ton navigateur.
py -m http.server 8080
pause
