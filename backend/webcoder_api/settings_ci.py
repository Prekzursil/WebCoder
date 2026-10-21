from . import settings as base_settings
from .settings import BASE_DIR

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

# Rate limiting (SPEC-GAPS SP4): the suite was not written against live
# throttle counters, so the default throttle classes are off here and the
# scoped rates are raised far above anything a test run can reach. The
# throttle MECHANISM is covered by dedicated tests that opt back in via
# override_settings with shrunk rates and an isolated cache.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,  # type: ignore[name-defined]  # imported via * above
    "DEFAULT_THROTTLE_CLASSES": [],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "10000/min",
        "user": "10000/min",
        "auth": "10000/min",
        "submit": "10000/min",
        "dj_rest_auth": "10000/min",
    },
}
