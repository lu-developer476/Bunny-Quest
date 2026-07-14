from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import PlayerProfile


@receiver(post_save, sender=User)
def ensure_player_profile(sender, instance, created, **kwargs):
    if created:
        PlayerProfile.objects.create(user=instance)
    else:
        PlayerProfile.objects.get_or_create(user=instance)
