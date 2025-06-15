import os
from celery import Celery
from pathlib import Path

# Set the default Django settings module for the 'celery' program.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'webcoder_api.settings')

app = Celery('webcoder_api')

# Using a string here means the worker doesn't have to serialize
# the configuration object to child processes.
# - namespace='CELERY' means all celery-related configuration keys
#   should have a `CELERY_` prefix.
app.config_from_object('django.conf:settings', namespace='CELERY')

# Define the base directory of the Django project
BASE_DIR = Path(__file__).resolve().parent.parent

# Configure the filesystem broker with absolute paths
app.conf.update(
    broker_url='filesystem://',
    broker_transport_options={
        'data_folder_in': str(BASE_DIR.parent / 'celery_broker'),
        'data_folder_out': str(BASE_DIR.parent / 'celery_broker_processed'),
        'data_folder_processed': str(BASE_DIR.parent / 'celery_broker_sent'),
    }
)

# Load task modules from all registered Django app configs.
app.autodiscover_tasks()

@app.task(bind=True)
def debug_task(self):
    print(f'Request: {self.request!r}')
