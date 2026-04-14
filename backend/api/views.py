from django.contrib.auth import login
from django.contrib.auth import get_user_model
from django.db.models import Prefetch
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView
from .models import ChatMessage, Group, GroupDocument, GroupMembership
from .services import (
    EMBEDDING_MODEL_NAME,
    VECTOR_STORE_BACKEND,
    answer_question,
    build_collection_name,
    extract_text_from_upload,
    index_document,
    mark_document_index_failed,
)
from .serializers import (
    AdminSignupSerializer,
    ChatMessageSerializer,
    ChatRequestSerializer,
    DocumentUploadSerializer,
    GroupDetailSerializer,
    GroupDocumentSerializer,
    GroupSummarySerializer,
    LoginSerializer,
    MemberCreateSerializer,
    ProfileSerializer,
    UserSummarySerializer,
)

User = get_user_model()


# Restricts member-creation endpoints to admins because only admins should provision new user access.
class IsAdminUserRole(permissions.BasePermission):
    # Checks the authenticated role directly to keep authorization logic simple and explicit.
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == User.Role.ADMIN)


# Loads a user's membership or fails fast because every group endpoint depends on workspace-level access control.
def get_membership_or_403(user, group_id):
    membership = GroupMembership.objects.select_related('group').filter(
        user=user,
        group_id=group_id,
    ).first()
    if membership is None:
        raise PermissionDenied('You do not have access to this group.')
    return membership


# Creates a new admin account and issues JWT tokens because company onboarding starts from a public signup flow.
class AdminSignupView(APIView):
    permission_classes = [permissions.AllowAny]

    # Validates signup input, creates the default workspace, and returns the authenticated session payload.
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


# Authenticates admins by email and members by member ID because the product supports two login identifiers.
class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    # Validates credentials and returns JWT tokens so the frontend can open the protected workspace.
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


# Reuses SimpleJWT refresh behavior because access tokens are intentionally short-lived.
class RefreshView(TokenRefreshView):
    permission_classes = [permissions.AllowAny]


# Blacklists the refresh token because logout should invalidate the current session immediately.
class LogoutView(APIView):
    # Accepts the refresh token and revokes it to prevent future access-token refreshes.
    def post(self, request):
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            raise ValidationError('Refresh token is required.')

        token = RefreshToken(refresh_token)
        token.blacklist()
        return Response(status=status.HTTP_205_RESET_CONTENT)


# Exposes the current user's editable profile because the UI lets users maintain their identity details.
class ProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = ProfileSerializer

    # Returns the authenticated user so profile reads and writes never target another account.
    def get_object(self):
        return self.request.user


# Lists only the groups visible to the current user because the workspace is fully membership-scoped.
class GroupListView(generics.ListAPIView):
    serializer_class = GroupSummarySerializer

    # Attaches the membership role to each group object because the frontend needs role-aware actions.
    def get_queryset(self):
        memberships = (
            GroupMembership.objects.filter(user=self.request.user)
            .select_related('group')
            .select_related('group__document', 'group__document__uploaded_by')
        )

        groups = []
        for membership in memberships:
            membership.group.role = membership.role
            groups.append(membership.group)
        return groups


# Returns one group's messages and document context because chat needs a full scoped workspace snapshot.
class GroupDetailView(generics.RetrieveAPIView):
    serializer_class = GroupDetailSerializer
    lookup_url_kwarg = 'group_id'

    # Resolves the group through membership checks so unauthorized users cannot enumerate group details.
    def get_object(self):
        membership = get_membership_or_403(self.request.user, self.kwargs['group_id'])
        group = (
            Group.objects.filter(pk=membership.group_id)
            .prefetch_related(
                Prefetch('messages', queryset=ChatMessage.objects.order_by('created_at', 'id'))
            )
            .select_related('document', 'document__uploaded_by')
            .get()
        )
        group.role = membership.role
        return group


# Handles source uploads because admins need a single endpoint to replace and re-index the active group document.
class GroupDocumentUploadView(APIView):
    # Extracts text, upserts the document row, indexes it in Chroma, and returns the refreshed chat context.
    def post(self, request, group_id):
        membership = get_membership_or_403(request.user, group_id)
        if membership.role != GroupMembership.Role.ADMIN:
            raise PermissionDenied('Only group admins can upload documents.')

        serializer = DocumentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uploaded_file = serializer.validated_data['file']
        extracted_text = extract_text_from_upload(uploaded_file)
        document, created = GroupDocument.objects.get_or_create(
            group_id=group_id,
            defaults={
                'title': serializer.validated_data.get('title') or uploaded_file.name,
                'description': serializer.validated_data.get('description', ''),
                'file': uploaded_file,
                'extracted_text': extracted_text,
                'embedding_model': EMBEDDING_MODEL_NAME,
                'vector_store_backend': VECTOR_STORE_BACKEND,
                'chroma_collection_name': build_collection_name(group_id),
                'source_mime_type': getattr(uploaded_file, 'content_type', '') or '',
                'chunk_count': 0,
                'indexing_status': GroupDocument.IndexingStatus.PENDING,
                'indexing_error': '',
                'uploaded_by': request.user,
            },
        )

        if not created:
            document.title = serializer.validated_data.get('title') or uploaded_file.name
            document.description = serializer.validated_data.get('description', '')
            document.file = uploaded_file
            document.extracted_text = extracted_text
            document.embedding_model = EMBEDDING_MODEL_NAME
            document.vector_store_backend = VECTOR_STORE_BACKEND
            document.chroma_collection_name = build_collection_name(group_id)
            document.source_mime_type = getattr(uploaded_file, 'content_type', '') or ''
            document.chunk_count = 0
            document.indexing_status = GroupDocument.IndexingStatus.PENDING
            document.indexing_error = ''
            document.indexed_at = None
            document.uploaded_by = request.user
            document.save()

        try:
            index_document(document)
        except ValidationError as exc:
            mark_document_index_failed(document, str(exc.detail if hasattr(exc, 'detail') else exc))
            raise
        except Exception as exc:
            mark_document_index_failed(document, str(exc))
            raise ValidationError(f'Failed to index the uploaded document: {exc}')

        if not ChatMessage.objects.filter(group_id=group_id, role=ChatMessage.Role.ASSISTANT).exists():
            ChatMessage.objects.create(
                group_id=group_id,
                role=ChatMessage.Role.ASSISTANT,
                content=(
                    f'The group document "{document.title}" is now available. '
                    'Ask questions that stay within this source.'
                ),
            )

        messages = ChatMessage.objects.filter(group_id=group_id).order_by('created_at', 'id')
        return Response(
            {
                'document': GroupDocumentSerializer(document).data,
                'messages': ChatMessageSerializer(messages, many=True).data,
            }
        )


# Sends a question through the indexed document because answers must stay bound to the selected group source.
class GroupChatView(APIView):
    # Saves the user message, generates the assistant reply from Chroma retrieval, and returns both state updates.
    def post(self, request, group_id):
        get_membership_or_403(request.user, group_id)
        serializer = ChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        document = GroupDocument.objects.filter(group_id=group_id).select_related('uploaded_by').first()
        if document is None:
            raise ValidationError('A group admin must upload a document before chat is available.')

        message_text = serializer.validated_data['message'].strip()
        ChatMessage.objects.create(
            group_id=group_id,
            user=request.user,
            role=ChatMessage.Role.USER,
            content=message_text,
        )
        assistant_message = ChatMessage.objects.create(
            group_id=group_id,
            role=ChatMessage.Role.ASSISTANT,
            content=answer_question(document, message_text),
        )

        return Response(
            {
                'message': ChatMessageSerializer(assistant_message).data,
                'document': GroupDocumentSerializer(document).data,
            },
            status=status.HTTP_201_CREATED,
        )


# Creates member accounts because admins need to provision access inside the groups they manage.
class MemberCreateView(APIView):
    permission_classes = [IsAdminUserRole]

    # Validates the admin's requested memberships and returns the new member profile.
    def post(self, request):
        serializer = MemberCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSummarySerializer(user).data, status=status.HTTP_201_CREATED)
