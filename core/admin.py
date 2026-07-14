from django.contrib import admin

from .models import GameScore, GameSession, PlayerProfile


@admin.register(PlayerProfile)
class PlayerProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "bunny_name", "bunny_color", "created_at")
    search_fields = ("user__username", "user__email", "bunny_name")
    list_filter = ("bunny_color", "created_at")


@admin.register(GameSession)
class GameSessionAdmin(admin.ModelAdmin):
    list_display = ("token", "user", "started_at", "finished_at", "used")
    list_filter = ("used", "started_at")
    search_fields = ("token", "user__username")
    readonly_fields = ("token", "started_at", "finished_at")


@admin.register(GameScore)
class GameScoreAdmin(admin.ModelAdmin):
    list_display = ("nickname", "score", "carrots", "level", "duration_ms", "created_at")
    list_filter = ("level", "created_at")
    search_fields = ("nickname", "user__username")
    readonly_fields = ("created_at",)
