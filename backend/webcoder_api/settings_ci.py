from .settings import *  # noqa: F403,F401

# CI verify uses sqlite to avoid coupling governance checks to live Postgres credentials.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "ci_verify.sqlite3",  # noqa: F405
    }
}

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]
