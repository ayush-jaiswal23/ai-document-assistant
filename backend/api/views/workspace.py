from django.db.models import Prefetch
from rest_framework import generics, permissions
from rest_framework.exceptions import PermissionDenied
from ..models import ChatMessage, Group, GroupDocument, GroupMembership
from ..serializers import (
    GroupDetailSerializer,
    GroupSummarySerializer,
    ProfileSerializer,
)

def get_membership_or_403(user, group_id):
    """
    Ensures the user has an active membership in the group.
    """
    membership = GroupMembership.objects.select_related('group').filter(
        user=user,
        group_id=group_id,
    ).first()
    if membership is None:
        raise PermissionDenied('You do not have access to this group.')
    return membership

class ProfileView(generics.RetrieveUpdateAPIView):
    """
    Retrieve or update the authenticated user's profile.
    """
    serializer_class = ProfileSerializer

    def get_object(self):
        return self.request.user

class GroupListView(generics.ListAPIView):
    """
    List all groups associated with the current user.
    """
    serializer_class = GroupSummarySerializer

    def get_queryset(self):
        memberships = (
            GroupMembership.objects.filter(user=self.request.user)
            .select_related('group')
            .prefetch_related(
                Prefetch(
                    'group__documents',
                    queryset=GroupDocument.objects.select_related('uploaded_by').order_by('-updated_at'),
                )
            )
        )

        groups = []
        for membership in memberships:
            membership.group.role = membership.role
            groups.append(membership.group)
        return groups

class GroupDetailView(generics.RetrieveAPIView):
    """
    Detailed group view including messages and documents.
    """
    serializer_class = GroupDetailSerializer
    lookup_url_kwarg = 'group_id'

    def get_object(self):
        membership = get_membership_or_403(self.request.user, self.kwargs['group_id'])
        group = (
            Group.objects.filter(pk=membership.group_id)
            .prefetch_related(
                Prefetch('messages', queryset=ChatMessage.objects.order_by('created_at', 'id')),
                Prefetch('documents', queryset=GroupDocument.objects.select_related('uploaded_by').order_by('-updated_at')),
            )
            .get()
        )
        group.role = membership.role
        return group
