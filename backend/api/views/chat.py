from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from ..models import ChatMessage, GroupDocument
from ..serializers import (
    ChatMessageSerializer,
    ChatRequestSerializer,
    GroupDocumentSerializer,
)
from ..services import answer_question
from .workspace import get_membership_or_403

class GroupChatView(APIView):
    """
    Manages group-scoped chat interactions using RAG.
    """
    def post(self, request, group_id):
        get_membership_or_403(request.user, group_id)
        serializer = ChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        documents = GroupDocument.objects.filter(group_id=group_id).select_related('uploaded_by').order_by('-updated_at')
        if not documents.exists():
            raise ValidationError('A group admin must upload a document before chat is available.')

        message_text = serializer.validated_data['message'].strip()
        
        # Save user message
        ChatMessage.objects.create(
            group_id=group_id,
            user=request.user,
            role=ChatMessage.Role.USER,
            content=message_text,
        )
        
        # Generate and save assistant reply
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
