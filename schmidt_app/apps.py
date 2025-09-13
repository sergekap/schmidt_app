# schmidt_app/apps.py
from django.apps import AppConfig

class SchmidtAppConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'schmidt_app'

    def ready(self):
        from . import signals
