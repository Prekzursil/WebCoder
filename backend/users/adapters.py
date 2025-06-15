from allauth.account.adapter import DefaultAccountAdapter
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.http import HttpResponseRedirect
from django.urls import reverse

class CustomAccountAdapter(DefaultAccountAdapter):
    def get_login_redirect_url(self, request):
        return "/"

class CustomSocialAccountAdapter(DefaultSocialAccountAdapter):
    def pre_social_login(self, request, sociallogin):
        # This method is called just before the user is logged in.
        # We can use it to check if the user is new and needs to complete registration.
        if sociallogin.is_existing:
            return

        # There is no existing social account for this user.
        # Check if a user already exists with the same email address.
        try:
            # This will fail if the user does not exist
            user = sociallogin.user
            # If the user exists, we can just link the social account and log them in.
            return
        except:
            # The user does not exist, so we need to redirect them to complete registration.
            # We'll pass the email address as a query parameter.
            email = sociallogin.account.extra_data.get('email')
            if email:
                # Redirect to the frontend complete registration page
                # The URL should match the route you defined in your React app
                redirect_url = f"/complete-registration?email={email}"
                return HttpResponseRedirect(redirect_url)

        # If we can't get an email, we'll just let allauth handle it.
        return
