from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User
from django.utils.crypto import get_random_string

from .models import PlayerProfile


class SignUpForm(UserCreationForm):
    email = forms.EmailField(label="Email", required=True)

    class Meta:
        model = User
        fields = ("email", "password1", "password2")

    def clean_email(self):
        email = self.cleaned_data["email"].lower()
        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError("Ya existe una cuenta con ese email.")
        return email

    def _build_pending_username(self):
        base = self.cleaned_data["email"].split("@", 1)[0].lower()
        safe_base = "".join(char for char in base if char.isalnum() or char in "._-")[:18] or "jugador"
        for _ in range(10):
            username = f"{safe_base}_{get_random_string(6).lower()}"
            if not User.objects.filter(username=username).exists():
                return username
        return f"jugador_{get_random_string(12).lower()}"

    def save(self, commit=True):
        user = super().save(commit=False)
        user.email = self.cleaned_data["email"]
        user.username = self._build_pending_username()
        if commit:
            user.save()
            PlayerProfile.objects.get_or_create(user=user)
        return user


class ProfileForm(forms.ModelForm):
    username = forms.CharField(label="Usuario", max_length=150)

    def __init__(self, *args, user=None, **kwargs):
        self.user = user
        super().__init__(*args, **kwargs)
        if user is not None:
            self.fields["username"].initial = user.username
        unlocked = {"none"}
        if user is not None:
            unlocked.update(
                user.achievements.exclude(achievement__accessory_reward="")
                .values_list("achievement__accessory_reward", flat=True)
            )
        current = self.instance.bunny_accessory if self.instance and self.instance.pk else "none"
        unlocked.add(current)
        self.fields["bunny_accessory"].choices = [
            choice for choice in PlayerProfile.BUNNY_ACCESSORIES if choice[0] in unlocked
        ]
        self.fields["bunny_accessory"].help_text = "Desbloqueás más accesorios consiguiendo insignias."

    def clean_username(self):
        username = self.cleaned_data["username"].strip()
        if not username:
            raise forms.ValidationError("Ingresá un usuario.")
        queryset = User.objects.filter(username__iexact=username)
        if self.user is not None:
            queryset = queryset.exclude(pk=self.user.pk)
        if queryset.exists():
            raise forms.ValidationError("Ese usuario ya está en uso.")
        return username

    def save(self, commit=True):
        profile = super().save(commit=commit)
        if self.user is not None:
            self.user.username = self.cleaned_data["username"]
            if commit:
                self.user.save(update_fields=["username"])
        return profile

    class Meta:
        model = PlayerProfile
        fields = ("username", "bunny_name", "bunny_breed", "bunny_color", "bunny_accessory")
        widgets = {
            "bunny_name": forms.TextInput(attrs={"maxlength": 24}),
        }
