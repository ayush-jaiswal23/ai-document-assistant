from django.contrib.auth import get_user_model
from django.db.models import Prefetch
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from ..models import GroupMembership
from ..serializers import (
    AdminMemberSerializer,
    MemberCreateSerializer,
    UserSummarySerializer,
)
from .auth import IsAdminUserRole

User = get_user_model()

class MemberCreateView(APIView):
    """
    Admin-only view for creating member accounts and listing managed members.
    """
    permission_classes = [IsAdminUserRole]

    def get(self, request):
        admin_group_ids = set(
            GroupMembership.objects.filter(
                user=request.user,
                role=GroupMembership.Role.ADMIN,
            ).values_list('group_id', flat=True)
        )
        members = (
            User.objects.filter(
                role=User.Role.MEMBER,
                memberships__group_id__in=admin_group_ids,
            )
            .distinct()
            .prefetch_related(
                Prefetch(
                    'memberships',
                    queryset=GroupMembership.objects.select_related('group').filter(group_id__in=admin_group_ids),
                )
            )
            .order_by('full_name', 'email')
        )
        serializer = AdminMemberSerializer(
            members,
            many=True,
            context={'admin_group_ids': admin_group_ids},
        )
        return Response(serializer.data)

    def post(self, request):
        serializer = MemberCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSummarySerializer(user).data, status=status.HTTP_201_CREATED)
