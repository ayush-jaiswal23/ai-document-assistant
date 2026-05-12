from django.contrib.auth import login, get_user_model
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import ValidationError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from ..serializers import (
    AdminSignupSerializer,
    LoginSerializer,
    UserSummarySerializer,
)

User = get_user_model()

class IsAdminUserRole(permissions.BasePermission):
    """
    Permission check to ensure the user has an ADMIN role.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == User.Role.ADMIN)

class AdminSignupView(APIView):
    """
    Handles public admin signup and initial workspace creation.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = AdminSignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        
        refresh = RefreshToken.for_user(user)
        refresh['role'] = user.role
        refresh['member_id'] = user.member_id or ''
        
        login(request, user)
        return Response(
            {
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'user': UserSummarySerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )

class LoginView(APIView):
    """
    Unified login for Admins (email) and Members (member_id).
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        
        refresh = RefreshToken.for_user(user)
        refresh['role'] = user.role
        refresh['member_id'] = user.member_id or ''
        
        login(request, user)
        return Response(
            {
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'user': UserSummarySerializer(user).data,
            }
        )

class RefreshView(TokenRefreshView):
    """
    Standard JWT token refresh.
    """
    permission_classes = [permissions.AllowAny]

class LogoutView(APIView):
    """
    Invalidates the session by blacklisting the provided refresh token.
    """
    def post(self, request):
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            raise ValidationError('Refresh token is required.')

        token = RefreshToken(refresh_token)
        token.blacklist()
        return Response(status=status.HTTP_205_RESET_CONTENT)
