from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from allauth.socialaccount.providers.github.views import GitHubOAuth2Adapter
from allauth.socialaccount.providers.oauth2.client import OAuth2Client
from dj_rest_auth.registration.views import SocialLoginView
from rest_framework import generics, permissions, status, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from .serializers import UserRegistrationSerializer, UserSerializer, PasswordChangeSerializer, AdminUserSerializer
from .models import User
from problems.models import Problem
from submissions.models import Submission
from .permissions import IsAdminUser, IsOwnerOrAdminForUser
from django.utils.translation import gettext_lazy as _

class UserRegistrationView(generics.CreateAPIView):
    """
    API endpoint for user registration.
    """
    queryset = User.objects.all()
    serializer_class = UserRegistrationSerializer
    permission_classes = [permissions.AllowAny] # Anyone can register

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                "user": UserSerializer(user, context=self.get_serializer_context()).data,
                "message": "User registered successfully."
            },
            status=status.HTTP_201_CREATED
        )

class PasswordChangeView(generics.GenericAPIView):
    """
    An endpoint for changing password.
    """
    serializer_class = PasswordChangeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        user = request.user
        serializer = self.get_serializer(data=request.data, context={'request': request})
        if serializer.is_valid(raise_exception=True):
            serializer.save()
            return Response({"detail": _("Password updated successfully.")}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class UserMeView(generics.RetrieveAPIView):
    """
    An endpoint to get the current authenticated user's details.
    """
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

class UserViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for viewing user profiles.
    """
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ['update', 'partial_update', 'destroy']:
            self.permission_classes = [IsOwnerOrAdminForUser]
        return super().get_permissions()

class AdminUserViewSet(viewsets.ModelViewSet):
    """
    API endpoint for admins to view and manage users.
    """
    queryset = User.objects.all().order_by('id')
    permission_classes = [IsAdminUser]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return AdminUserSerializer
        return UserSerializer

class GoogleLogin(SocialLoginView):
    adapter_class = GoogleOAuth2Adapter
    client_class = OAuth2Client
    callback_url = "http://localhost:3000/login"

class GithubLogin(SocialLoginView):
    adapter_class = GitHubOAuth2Adapter
    client_class = OAuth2Client
    callback_url = "http://localhost:3000/login"

class AdminStatsView(APIView):
    """
    API endpoint for admins to view site statistics.
    """
    permission_classes = [IsAdminUser]

    def get(self, request, *args, **kwargs):
        user_count = User.objects.count()
        problem_count = Problem.objects.count()
        submission_count = Submission.objects.count()

        stats = {
            'user_count': user_count,
            'problem_count': problem_count,
            'submission_count': submission_count,
        }
        return Response(stats)
