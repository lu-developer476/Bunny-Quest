import json
from datetime import timedelta

from django.contrib.auth.models import User
from django.test import Client, TestCase
from django.urls import reverse
from django.utils import timezone

from .models import GameScore, GameSession, PlayerProfile


class PublicPagesTests(TestCase):
    def test_public_pages_load(self):
        for name in ("home", "game", "leaderboard", "health"):
            response = self.client.get(reverse(name))
            self.assertEqual(response.status_code, 200, name)

    def test_profile_requires_login(self):
        response = self.client.get(reverse("profile"))
        self.assertEqual(response.status_code, 302)
        self.assertIn(reverse("login"), response.url)


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
