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
    bunny_accessory = forms.MultipleChoiceField(
        label="Accesorios",
        required=False,
        widget=forms.CheckboxSelectMultiple,
    )

    def __init__(self, *args, user=None, **kwargs):
        self.user = user
        super().__init__(*args, **kwargs)
        if user is not None:
            self.fields["username"].initial = user.username
        self.fields["bunny_accessory"] = forms.MultipleChoiceField(
            label="Accesorios",
            required=False,
            widget=forms.CheckboxSelectMultiple,
        )
        unlocked = {"none"}
        if user is not None:
            unlocked.update(
                user.achievements.exclude(achievement__accessory_reward="")
                .values_list("achievement__accessory_reward", flat=True)
            )
            unlocked.update(user.accessory_purchases.values_list("accessory", flat=True))
        current = set(self.instance.equipped_accessories if self.instance and self.instance.pk else [])
        unlocked.update(current)
        self.fields["bunny_accessory"].choices = [
            choice for choice in PlayerProfile.BUNNY_ACCESSORIES if choice[0] in unlocked and choice[0] != "none"
        ]
        self.fields["bunny_accessory"].initial = list(current)
        self.fields["bunny_accessory"].help_text = "Desbloqueás más accesorios con insignias o comprándolos en la tienda. Podés equipar hasta 5 a la vez."

    def clean_bunny_accessory(self):
        selected = [item for item in self.cleaned_data.get("bunny_accessory", []) if item != "none"]
        unique_selected = list(dict.fromkeys(selected))
        if len(unique_selected) > 5:
            raise forms.ValidationError("Podés equipar hasta 5 accesorios a la vez.")
        return unique_selected

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
        profile = super().save(commit=False)
        accessories = self.cleaned_data.get("bunny_accessory", [])[:5]
        profile.bunny_accessory = ",".join(accessories) if accessories else "none"
        if commit:
            profile.save()
        if self.user is not None:
            self.user.username = self.cleaned_data["username"]
            if commit:
                self.user.save(update_fields=["username"])
        return profile

    class Meta:
        model = PlayerProfile
        fields = ("username", "bunny_name", "bunny_breed", "bunny_color", "bunny_accessory", "preferred_theme")
        widgets = {
            "bunny_name": forms.TextInput(attrs={"maxlength": 24}),
        }
