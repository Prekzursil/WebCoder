import os
from django.core.management.base import BaseCommand
from allauth.socialaccount.models import SocialApp
from django.contrib.sites.models import Site

class Command(BaseCommand):
    help = 'Creates the social applications for Google and GitHub from environment variables.'

    def handle(self, *args, **options):
        site = Site.objects.get_current()

        # Google
        google_client_id = os.environ.get('GOOGLE_CLIENT_ID')
        google_secret = os.environ.get('GOOGLE_SECRET')
        if google_client_id and google_secret:
            if not SocialApp.objects.filter(provider='google').exists():
                google_app = SocialApp.objects.create(
                    provider='google',
                    name='Google',
                    client_id=google_client_id,
                    secret=google_secret
                )
                google_app.sites.add(site)
                self.stdout.write(self.style.SUCCESS('Successfully created Google social application.'))
            else:
                self.stdout.write(self.style.WARNING('Google social application already exists.'))
        else:
            self.stdout.write(self.style.ERROR('Google client ID and secret not found in environment variables.'))

        # GitHub
        github_client_id = os.environ.get('GITHUB_CLIENT_ID')
        github_secret = os.environ.get('GITHUB_SECRET')
        if github_client_id and github_secret:
            if not SocialApp.objects.filter(provider='github').exists():
                github_app = SocialApp.objects.create(
                    provider='github',
                    name='GitHub',
                    client_id=github_client_id,
                    secret=github_secret
                )
                github_app.sites.add(site)
                self.stdout.write(self.style.SUCCESS('Successfully created GitHub social application.'))
            else:
                self.stdout.write(self.style.WARNING('GitHub social application already exists.'))
        else:
            self.stdout.write(self.style.ERROR('GitHub client ID and secret not found in environment variables.'))
