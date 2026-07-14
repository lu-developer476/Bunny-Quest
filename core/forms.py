from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User

from .models import PlayerProfile


class SignUpForm(UserCreationForm):
    email = forms.EmailField(label="Email", required=True)
    bunny_name = forms.CharField(label="Nombre de tu conejo", max_length=24, initial="Nube")

    class Meta:
        model = User
        fields = ("username", "email", "bunny_name", "password1", "password2")
        labels = {"username": "Usuario"}

    def clean_email(self):
        email = self.cleaned_data["email"].lower()
        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError("Ya existe una cuenta con ese email.")
        return email

    def save(self, commit=True):
        user = super().save(commit=False)
        user.email = self.cleaned_data["email"]
        if commit:
            user.save()
            profile, _ = PlayerProfile.objects.get_or_create(user=user)
            profile.bunny_name = self.cleaned_data["bunny_name"]
            profile.save(update_fields=["bunny_name"])
        return user


class ProfileForm(forms.ModelForm):
    def __init__(self, *args, user=None, **kwargs):
        super().__init__(*args, **kwargs)
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

    class Meta:
        model = PlayerProfile
        fields = ("bunny_name", "bunny_color", "bunny_accessory")
        widgets = {
            "bunny_name": forms.TextInput(attrs={"maxlength": 24}),
        }
