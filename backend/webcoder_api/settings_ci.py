from . import settings as base_settings

for _name in dir(base_settings):
    if _name.isupper():
        globals()[_name] = getattr(base_settings, _name)

# CI verify uses sqlite to avoid coupling governance checks to live Postgres credentials.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "ci_verify.sqlite3",
    }
}

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]
