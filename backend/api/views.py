from django.contrib.auth import login
from django.contrib.auth import get_user_model
from django.db.models import Prefetch
from pathlib import Path
from uuid import uuid4
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
    AdminMemberSerializer,
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


# Returns one group's messages and documents because chat needs a full scoped workspace snapshot.
class GroupDetailView(generics.RetrieveAPIView):
    serializer_class = GroupDetailSerializer
    lookup_url_kwarg = 'group_id'

    # Resolves the group through membership checks so unauthorized users cannot enumerate group details.
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


# Handles source uploads because admins need a single endpoint to add indexed files to the group knowledge base.
class GroupDocumentUploadView(APIView):
    # Extracts each selected file, creates document rows, indexes them in Chroma, and returns the refreshed chat context.
    def post(self, request, group_id):
        membership = get_membership_or_403(request.user, group_id)
        if membership.role != GroupMembership.Role.ADMIN:
            raise PermissionDenied('Only group admins can upload documents.')

        serializer = DocumentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uploaded_files = request.FILES.getlist('files') or request.FILES.getlist('file')
        if not uploaded_files:
            raise ValidationError('Choose at least one file before uploading.')

        uploaded_documents = []
        upload_errors = []
        shared_title = serializer.validated_data.get('title', '').strip()
        description = serializer.validated_data.get('description', '')

        for uploaded_file in uploaded_files:
            try:
                extracted_text = extract_text_from_upload(uploaded_file)
            except ValidationError as exc:
                upload_errors.append(
                    {
                        'file_name': uploaded_file.name,
                        'error': str(exc.detail if hasattr(exc, 'detail') else exc),
                    }
                )
                continue

            document_title = shared_title if len(uploaded_files) == 1 and shared_title else Path(uploaded_file.name).stem
            document = GroupDocument.objects.create(
                group_id=group_id,
                title=document_title,
                description=description,
                file=uploaded_file,
                extracted_text=extracted_text,
                embedding_model=EMBEDDING_MODEL_NAME,
                vector_store_backend=VECTOR_STORE_BACKEND,
                chroma_collection_name=build_collection_name(group_id, uuid4().hex),
                source_mime_type=getattr(uploaded_file, 'content_type', '') or '',
                chunk_count=0,
                indexing_status=GroupDocument.IndexingStatus.PENDING,
                indexing_error='',
                uploaded_by=request.user,
            )
            document.chroma_collection_name = build_collection_name(group_id, document.id)
            document.save(update_fields=['chroma_collection_name', 'updated_at'])

            try:
                index_document(document)
            except ValidationError as exc:
                error_message = str(exc.detail if hasattr(exc, 'detail') else exc)
                mark_document_index_failed(document, error_message)
                upload_errors.append({'file_name': uploaded_file.name, 'error': error_message})
            except Exception as exc:
                error_message = str(exc)
                mark_document_index_failed(document, error_message)
                upload_errors.append({'file_name': uploaded_file.name, 'error': error_message})

            uploaded_documents.append(document)

        if not uploaded_documents:
            raise ValidationError({'files': upload_errors or ['No files could be uploaded.']})

        if not ChatMessage.objects.filter(group_id=group_id, role=ChatMessage.Role.ASSISTANT).exists():
            document_count = len(uploaded_documents)
            ChatMessage.objects.create(
                group_id=group_id,
                role=ChatMessage.Role.ASSISTANT,
                content=(
                    f'{document_count} group document{"s" if document_count != 1 else ""} now available. '
                    'Ask questions that stay within the indexed group sources.'
                ),
            )

        messages = ChatMessage.objects.filter(group_id=group_id).order_by('created_at', 'id')
        documents = GroupDocument.objects.filter(group_id=group_id).select_related('uploaded_by').order_by('-updated_at')
        return Response(
            {
                'document': GroupDocumentSerializer(uploaded_documents[0]).data,
                'uploaded_documents': GroupDocumentSerializer(uploaded_documents, many=True).data,
                'documents': GroupDocumentSerializer(documents, many=True).data,
                'upload_errors': upload_errors,
                'messages': ChatMessageSerializer(messages, many=True).data,
            }
        )


# Sends a question through indexed group documents because answers must stay bound to the selected group sources.
class GroupChatView(APIView):
    # Saves the user message, generates the assistant reply from Chroma retrieval, and returns both state updates.
    def post(self, request, group_id):
        get_membership_or_403(request.user, group_id)
        serializer = ChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        documents = GroupDocument.objects.filter(group_id=group_id).select_related('uploaded_by').order_by('-updated_at')
        if not documents.exists():
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
            content=answer_question(documents, message_text),
        )

        return Response(
            {
                'message': ChatMessageSerializer(assistant_message).data,
                'documents': GroupDocumentSerializer(documents, many=True).data,
            },
            status=status.HTTP_201_CREATED,
        )


# Creates member accounts because admins need to provision access inside the groups they manage.
class MemberCreateView(APIView):
    permission_classes = [IsAdminUserRole]

    # Lists member users inside groups administered by the current admin so admins can review provisioned access.
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

    # Validates the admin's requested memberships and returns the new member profile.
    def post(self, request):
        serializer = MemberCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSummarySerializer(user).data, status=status.HTTP_201_CREATED)
