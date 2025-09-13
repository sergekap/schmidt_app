# schmidt_app/signals.py
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import ColorImage

@receiver(post_save, sender=ColorImage)
def colorimage_set_url(sender, instance: ColorImage, created, **kwargs):
    instance.update_file_url(commit=True)

@receiver(post_delete, sender=ColorImage)
def colorimage_delete_file(sender, instance: ColorImage, **kwargs):
    if instance.image and instance.image.name:
        storage = instance.image.storage
        if storage.exists(instance.image.name):
            storage.delete(instance.image.name)
