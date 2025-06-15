from django.contrib.auth import get_user_model

def get_sentinel_user():
    """
    Returns a sentinel user for models with on_delete=models.SET.
    This is used to preserve historical data when a user is deleted.
    """
    User = get_user_model()
    return User.objects.get_or_create(username='deleted_user')[0]
