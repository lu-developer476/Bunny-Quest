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
    class Meta:
        model = PlayerProfile
        fields = ("bunny_name", "bunny_color")
        widgets = {
            "bunny_name": forms.TextInput(attrs={"maxlength": 24}),
        }
