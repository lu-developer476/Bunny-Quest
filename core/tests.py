import json
from datetime import timedelta

from django.contrib.auth.models import User
from django.http import QueryDict
from django.test import Client, TestCase
from django.urls import reverse
from django.utils import timezone

from .forms import ProfileForm
from .models import AccessoryPurchase, GameScore, GameSession, PlayerAchievement, PlayerProfile


class PublicPagesTests(TestCase):
    def test_public_pages_load(self):
        for name in ("home", "game", "leaderboard", "health"):
            response = self.client.get(reverse(name))
            self.assertEqual(response.status_code, 200, name)

    def test_profile_requires_login(self):
        response = self.client.get(reverse("profile"))
        self.assertEqual(response.status_code, 302)
        self.assertIn(reverse("login"), response.url)

    def test_game_exposes_accessible_sound_control(self):
        response = self.client.get(reverse("game"))
        self.assertContains(response, 'id="soundButton"')
        self.assertContains(response, 'aria-label="Sonido activado"')


class ProfileTests(TestCase):
    def test_profile_created_with_user(self):
        user = User.objects.create_user("lu", password="StrongPass123!")
        self.assertTrue(PlayerProfile.objects.filter(user=user).exists())


class GameApiTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)

    def test_start_and_submit_score(self):
        start = self.client.post(reverse("api_start_session"))
        self.assertEqual(start.status_code, 200)
        token = start.json()["token"]
        session = GameSession.objects.get(token=token)
        session.started_at = timezone.now() - timedelta(seconds=10)
        session.save(update_fields=["started_at"])

        response = self.client.post(
            reverse("api_submit_score"),
            data=json.dumps({
                "token": token,
                "nickname": "Nube",
                "score": 1200,
                "carrots": 8,
                "level": 2,
                "duration_ms": 10000,
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(GameScore.objects.count(), 1)

    def test_session_cannot_be_used_twice(self):
        session = GameSession.objects.create(
            used=True,
            finished_at=timezone.now(),
        )
        response = self.client.post(
            reverse("api_submit_score"),
            data=json.dumps({
                "token": str(session.token),
                "nickname": "Nube",
                "score": 100,
                "carrots": 1,
                "level": 1,
                "duration_ms": 5000,
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)


class RewardsTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)
        self.user = User.objects.create_user("mora", password="StrongPass123!")
        self.client.force_login(self.user)

    def test_score_unlocks_achievements_and_records_combo(self):
        start = self.client.post(reverse("api_start_session"))
        token = start.json()["token"]
        session = GameSession.objects.get(token=token)
        session.started_at = timezone.now() - timedelta(seconds=10)
        session.save(update_fields=["started_at"])

        response = self.client.post(
            reverse("api_submit_score"),
            data=json.dumps({
                "token": token,
                "nickname": "Mora",
                "score": 12000,
                "carrots": 30,
                "level": 10,
                "max_combo": 8,
                "duration_ms": 10000,
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(GameScore.objects.get().max_combo, 8)
        self.assertGreaterEqual(PlayerAchievement.objects.filter(user=self.user).count(), 5)
        self.assertIn("Huella dorada", response.json()["achievements"])

    def test_profile_shows_daily_missions_and_achievements(self):
        response = self.client.get(reverse("profile"))
        self.assertContains(response, "Misiones diarias")
        self.assertContains(response, "Insignias del bosque")
        self.assertContains(response, "Desbloqueás más accesorios")



class AccessoryEquipmentTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("sol", password="StrongPass123!")
        self.profile = self.user.player_profile
        for accessory in ["scarf", "flower", "bow", "clover", "cap", "collar"]:
            AccessoryPurchase.objects.create(user=self.user, accessory=accessory)

    def test_profile_form_allows_up_to_five_equipped_accessories(self):
        data = QueryDict(mutable=True)
        data.update({
            "username": "sol",
            "bunny_name": "Nube",
            "bunny_breed": "lop",
            "bunny_color": "snow",
            "preferred_theme": "white",
        })
        data.setlist("bunny_accessory", ["scarf", "flower", "bow", "clover", "cap"])
        form = ProfileForm(
            data=data,
            instance=self.profile,
            user=self.user,
        )

        self.assertTrue(form.is_valid(), form.errors)
        profile = form.save()
        self.assertEqual(profile.equipped_accessories, ["scarf", "flower", "bow", "clover", "cap"])

    def test_profile_form_rejects_more_than_five_equipped_accessories(self):
        data = QueryDict(mutable=True)
        data.update({
            "username": "sol",
            "bunny_name": "Nube",
            "bunny_breed": "lop",
            "bunny_color": "snow",
            "preferred_theme": "white",
        })
        data.setlist("bunny_accessory", ["scarf", "flower", "bow", "clover", "cap", "collar"])
        form = ProfileForm(
            data=data,
            instance=self.profile,
            user=self.user,
        )

        self.assertFalse(form.is_valid())
        self.assertIn("Podés equipar hasta 5 accesorios", form.errors["bunny_accessory"][0])
