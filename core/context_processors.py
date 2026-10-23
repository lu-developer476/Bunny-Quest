import os


def analytics_settings(request):
    return {"GOOGLE_ANALYTICS_ID": os.getenv("GOOGLE_ANALYTICS_ID", "").strip()}
