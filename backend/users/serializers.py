from rest_framework import serializers
from .models import User
from django.contrib.auth.password_validation import validate_password
from django.utils.translation import gettext_lazy as _
from dj_rest_auth.serializers import LoginSerializer
import logging

logger = logging.getLogger(__name__)

class CustomLoginSerializer(LoginSerializer):
    user = serializers.SerializerMethodField()

    def get_user(self, obj):
        user = self.context['request'].user
        return UserSerializer(user).data

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret['user'] = self.get_user(instance)
        logger.info(f"CustomLoginSerializer response: {ret}")
        return ret

class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, required=True, label=_("Confirm password"))

    class Meta:
        model = User
        fields = ('username', 'email', 'password', 'password2', 'first_name', 'last_name', 'role')
        extra_kwargs = {
            'first_name': {'required': False},
            'last_name': {'required': False},
            'role': {'required': False} # Defaults to BASIC_USER in model
        }

    def validate_email(self, value):
        """
        Check that the email is not already in use.
        """
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(_("A user with that email already exists."))
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({"password2": _("Password fields didn't match.")})
        return attrs

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            role=validated_data.get('role', User.Roles.BASIC_USER)
        )
        # Note: create_user handles password hashing.
        return user

class UserSerializer(serializers.ModelSerializer):
    """
    Serializer for User model (read-only or for updates by admin/owner).
    """
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'role', 'is_staff', 'is_active', 'date_joined')
        read_only_fields = ('date_joined', 'id') # Role might be updatable by admin

class AdminUserSerializer(serializers.ModelSerializer):
    """
    Serializer for admin to manage users. Allows updating role, is_active, etc.
    """
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'role', 'is_staff', 'is_active', 'date_joined')
        read_only_fields = ('date_joined', 'id', 'username', 'email') # Keep sensitive fields read-only on this endpoint

class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True, write_only=True)
    new_password1 = serializers.CharField(required=True, write_only=True, validators=[validate_password], label=_("New password"))
    new_password2 = serializers.CharField(required=True, write_only=True, label=_("Confirm new password"))

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError(_("Your old password was entered incorrectly. Please enter it again."))
        return value

    def validate(self, attrs):
        if attrs['new_password1'] != attrs['new_password2']:
            raise serializers.ValidationError({"new_password2": _("The two new password fields didn't match.")})
        
        if attrs['old_password'] == attrs['new_password1']:
            raise serializers.ValidationError({"new_password1": _("New password cannot be the same as the old password.")})
        return attrs

    def save(self, **kwargs):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password1'])
        user.save()
        # Optionally, update session auth hash if using session authentication alongside JWT
        # from django.contrib.auth import update_session_auth_hash
        # if hasattr(self.context['request'], 'session'):
        #    update_session_auth_hash(self.context['request'], user)
        return user
