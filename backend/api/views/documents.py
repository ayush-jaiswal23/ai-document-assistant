from pathlib import Path
from uuid import uuid4
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from ..models import ChatMessage, GroupDocument, GroupMembership
from ..serializers import (
    ChatMessageSerializer,
    DocumentUploadSerializer,
    GroupDocumentSerializer,
)
from ..services import (
    EMBEDDING_MODEL_NAME,
    VECTOR_STORE_BACKEND,
    build_collection_name,
    extract_text_from_upload,
    index_document,
    mark_document_index_failed,
)
from .workspace import get_membership_or_403

class GroupDocumentUploadView(APIView):
    """
    Handles file uploads, text extraction, and vector store indexing.
    """
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

        # Add an initial assistant message if this is the first document upload for the group
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
