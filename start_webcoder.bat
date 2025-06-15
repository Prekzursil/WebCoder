@echo off
ECHO Starting WebCoder Application...

cd /d "%~dp0"

ECHO Checking for processes on port 8000 (Django) and 3000 (React)...

FOR /F "tokens=5" %%P IN ('netstat -a -n -o ^| findstr :8000') DO (
  ECHO Killing process on port 8000 with PID %%P
  taskkill /F /PID %%P
)

FOR /F "tokens=5" %%P IN ('netstat -a -n -o ^| findstr :3000') DO (
  ECHO Killing process on port 3000 with PID %%P
  taskkill /F /PID %%P
)

ECHO Starting Django server...
start "Django Server" /B cmd /c "cd backend && python manage.py runserver"

ECHO Creating Celery directories...
mkdir celery_broker
mkdir celery_broker_processed
mkdir celery_broker_sent

ECHO Starting Celery worker...
start "Celery Worker" /B cmd /c "cd backend && celery -A webcoder_api worker -l info"

ECHO Starting React frontend...
start "React Frontend" /B cmd /c "cd frontend/webcoder_ui && npm start"

ECHO All services are starting in the background.
