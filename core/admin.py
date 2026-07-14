from django.contrib import admin

from .models import Achievement, GameScore, GameSession, PlayerAchievement, PlayerProfile


@admin.register(PlayerProfile)
class PlayerProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "bunny_name", "bunny_color", "bunny_accessory", "created_at")
    search_fields = ("user__username", "user__email", "bunny_name")
    list_filter = ("bunny_color", "bunny_accessory", "created_at")


@admin.register(GameSession)
class GameSessionAdmin(admin.ModelAdmin):
    list_display = ("token", "user", "started_at", "finished_at", "used")
    list_filter = ("used", "started_at")
    search_fields = ("token", "user__username")
    readonly_fields = ("token", "started_at", "finished_at")


@admin.register(GameScore)
class GameScoreAdmin(admin.ModelAdmin):
    list_display = ("nickname", "score", "carrots", "level", "max_combo", "duration_ms", "created_at")
    list_filter = ("level", "created_at")
    search_fields = ("nickname", "user__username")
    readonly_fields = ("created_at",)


@admin.register(Achievement)
class AchievementAdmin(admin.ModelAdmin):
    list_display = ("name", "kind", "threshold", "accessory_reward", "sort_order")
    list_filter = ("kind", "accessory_reward")
    search_fields = ("name", "code", "description")


@admin.register(PlayerAchievement)
class PlayerAchievementAdmin(admin.ModelAdmin):
    list_display = ("user", "achievement", "unlocked_at")
    list_filter = ("achievement", "unlocked_at")
    search_fields = ("user__username", "achievement__name")
