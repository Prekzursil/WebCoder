@echo off
ECHO Starting WebCoder Application...

cd /d "%~dp0"

ECHO Checking for processes on port 8000 (Django) and 3000 (Next)...

FOR /F "tokens=5" %%P IN ('netstat -a -n -o ^| findstr :8000') DO (
  ECHO Killing process on port 8000 with PID %%P
  taskkill /F /PID %%P
)

FOR /F "tokens=5" %%P IN ('netstat -a -n -o ^| findstr :3000') DO (
  ECHO Killing process on port 3000 with PID %%P
  taskkill /F /PID %%P
)

ECHO Creating Celery directories...
mkdir celery_broker 2>nul
mkdir celery_broker_processed 2>nul
mkdir celery_broker_sent 2>nul

ECHO Starting Django server...
start "Django Server" /B cmd /c "cd backend && set SECRET_KEY=dev-secret-change-me&& set DB_PASSWORD=dev-db-password&& python manage.py runserver"

ECHO Starting Celery worker...
start "Celery Worker" /B cmd /c "cd backend && set SECRET_KEY=dev-secret-change-me&& set DB_PASSWORD=dev-db-password&& celery -A webcoder_api worker -l info"

ECHO Starting Next.js frontend...
start "Next Frontend" /B cmd /c "cd frontend/web && npm run dev"

ECHO All services starting in the background. Frontend: http://localhost:3000
ECHO NOTE: real secrets belong in backend\.env (gitignored) - the inline vars above are dev placeholders only.
