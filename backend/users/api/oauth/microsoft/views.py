from allauth.socialaccount.providers.microsoft.views import (
    MicrosoftGraphOAuth2Adapter,
)
from allauth.socialaccount.providers.oauth2.client import OAuth2Client
from dj_rest_auth.registration.views import SocialLoginView


# OPS-3 (competitive roadmap): Microsoft/Azure AD (school) SSO — RO schools
# commonly run Office 365, so this removes the largest classroom onboarding
# friction. Same SPA contract as the Google/GitHub lanes: the browser does
# the redirect dance against /accounts/microsoft/..., the SPA posts the code
# here (login/) or an access token (login/token/).
class MicrosoftLogin(SocialLoginView):
    adapter_class = MicrosoftGraphOAuth2Adapter
    # The tenant-specific callback the SPA registers in Azure AD; env
    # override for deployed origins (see RUNBOOK).
    import os

    callback_url = os.environ.get(
        "MICROSOFT_LOGIN_CALLBACK_URL",
        "http://localhost:3000/login/microsoft/callback",
    )
    client_class = OAuth2Client


class MicrosoftTokenLogin(SocialLoginView):
    adapter_class = MicrosoftGraphOAuth2Adapter
    client_class = OAuth2Client
