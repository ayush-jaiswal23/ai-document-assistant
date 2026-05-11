from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from unittest.mock import patch

from .models import Group, GroupDocument, GroupMembership

User = get_user_model()


class AuthAndGroupSecurityTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email='admin@example.com',
            password='AdminPassword@123',
            full_name='Admin User',
            role=User.Role.ADMIN,
            is_staff=True,
        )
        self.member = User.objects.create_user(
            email='member@example.com',
            password='MemberPassword@123',
            full_name='Member User',
            role=User.Role.MEMBER,
            member_id='MEM-MEMBER-0001',
        )
        self.other_member = User.objects.create_user(
            email='other@example.com',
            password='OtherPassword@123',
            full_name='Other Member',
            role=User.Role.MEMBER,
            member_id='MEM-OTHER-0001',
        )

        self.group = Group.objects.create(name='Operations', description='Ops docs')
        self.other_group = Group.objects.create(name='Finance', description='Finance docs')
        GroupMembership.objects.create(user=self.admin, group=self.group, role=GroupMembership.Role.ADMIN)
        GroupMembership.objects.create(user=self.member, group=self.group, role=GroupMembership.Role.MEMBER)
        GroupMembership.objects.create(user=self.other_member, group=self.other_group, role=GroupMembership.Role.MEMBER)

    def authenticate(self, identifier, password):
        response = self.client.post(
            reverse('login'),
            {'identifier': identifier, 'password': password},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        return response

    def test_member_can_login_with_member_id(self):
        response = self.client.post(
            reverse('login'),
            {'identifier': 'MEM-MEMBER-0001', 'password': 'MemberPassword@123'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['user']['member_id'], 'MEM-MEMBER-0001')

    def test_public_admin_signup_creates_workspace(self):
        response = self.client.post(
            reverse('signup'),
            {
                'full_name': 'Company Admin',
                'company_name': 'Acme Corp',
                'email': 'company.admin@example.com',
                'password': 'AcmeAdminPass@123',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created_user = User.objects.get(email='company.admin@example.com')
        self.assertEqual(created_user.role, User.Role.ADMIN)
        self.assertEqual(created_user.company_name, 'Acme Corp')
        self.assertTrue(
            GroupMembership.objects.filter(user=created_user, role=GroupMembership.Role.ADMIN).exists()
        )

    def test_logout_blacklists_refresh_token(self):
        login_response = self.client.post(
            reverse('login'),
            {'identifier': 'admin@example.com', 'password': 'AdminPassword@123'},
            format='json',
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_response.data['access']}")

        logout_response = self.client.post(
            reverse('logout'),
            {'refresh': login_response.data['refresh']},
            format='json',
        )

        self.assertEqual(logout_response.status_code, status.HTTP_205_RESET_CONTENT)

    def test_admin_can_create_member_for_owned_groups_only(self):
        self.authenticate('admin@example.com', 'AdminPassword@123')

        response = self.client.post(
            reverse('member_create'),
            {
                'full_name': 'New Member',
                'email': 'new.member@example.com',
                'password': 'StrongMember@123',
                'group_ids': [self.group.id],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created_user = User.objects.get(email='new.member@example.com')
        self.assertEqual(created_user.role, User.Role.MEMBER)
        self.assertTrue(created_user.member_id.startswith('MEM-'))
        self.assertTrue(
            GroupMembership.objects.filter(
                user=created_user,
                group=self.group,
                role=GroupMembership.Role.MEMBER,
            ).exists()
        )

    def test_admin_can_list_members_for_owned_groups_only(self):
        self.authenticate('admin@example.com', 'AdminPassword@123')

        response = self.client.get(reverse('member_create'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        member_ids = {member['member_id'] for member in response.data}
        self.assertIn('MEM-MEMBER-0001', member_ids)
        self.assertNotIn('MEM-OTHER-0001', member_ids)

    def test_member_cannot_create_member_accounts(self):
        self.authenticate('MEM-MEMBER-0001', 'MemberPassword@123')

        response = self.client.post(
            reverse('member_create'),
            {
                'full_name': 'Blocked Member',
                'email': 'blocked@example.com',
                'password': 'StrongMember@123',
                'group_ids': [self.group.id],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_member_cannot_access_other_group_chat(self):
        GroupDocument.objects.create(
            group=self.other_group,
            title='Finance Playbook',
            description='Finance answers',
            file=SimpleUploadedFile('finance.md', b'Budget approvals require CFO signoff.'),
            extracted_text='Budget approvals require CFO signoff.',
            embedding_model='models/gemini-embedding-001',
            vector_store_backend='chroma',
            chroma_collection_name=f'group-document-{self.other_group.id}-1',
            source_mime_type='text/markdown',
            chunk_count=1,
            indexing_status=GroupDocument.IndexingStatus.INDEXED,
            uploaded_by=self.admin,
        )
        self.authenticate('MEM-MEMBER-0001', 'MemberPassword@123')

        response = self.client.post(
            reverse('group_chat', kwargs={'group_id': self.other_group.id}),
            {'message': 'Who signs budgets?'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch('api.views.answer_question', return_value='Based on "Operations Guide", Severity 1 incidents require a 15 minute acknowledgement.')
    @patch('api.views.index_document')
    def test_group_admin_can_upload_document_and_member_can_chat(self, mock_index_document, mock_answer_question):
        def index_side_effect(document):
            document.chunk_count = 1
            document.indexing_status = GroupDocument.IndexingStatus.INDEXED
            document.indexing_error = ''
            document.save(update_fields=['chunk_count', 'indexing_status', 'indexing_error', 'updated_at'])

        mock_index_document.side_effect = index_side_effect

        self.authenticate('admin@example.com', 'AdminPassword@123')
        upload_response = self.client.post(
            reverse('group_document_upload', kwargs={'group_id': self.group.id}),
            {
                'title': 'Operations Guide',
                'description': 'Support guidance',
                'file': SimpleUploadedFile(
                    'operations.md',
                    b'Severity 1 incidents require a 15 minute acknowledgement.',
                    content_type='text/markdown',
                ),
            },
        )

        self.assertEqual(upload_response.status_code, status.HTTP_200_OK)
        document = GroupDocument.objects.get(group=self.group)
        self.assertEqual(document.embedding_model, 'models/gemini-embedding-001')
        self.assertEqual(document.vector_store_backend, 'chroma')
        self.assertEqual(document.chroma_collection_name, f'group-document-{self.group.id}-{document.id}')
        self.assertEqual(document.indexing_status, GroupDocument.IndexingStatus.INDEXED)
        self.assertEqual(document.chunk_count, 1)
        self.assertEqual(len(upload_response.data['documents']), 1)
        self.client.credentials()
        self.authenticate('MEM-MEMBER-0001', 'MemberPassword@123')

        chat_response = self.client.post(
            reverse('group_chat', kwargs={'group_id': self.group.id}),
            {'message': 'What is the severity 1 SLA?'},
            format='json',
        )

        self.assertEqual(chat_response.status_code, status.HTTP_201_CREATED)
        self.assertIn('Operations Guide', chat_response.data['message']['content'])

    @patch('api.views.index_document')
    def test_group_admin_can_upload_multiple_documents(self, mock_index_document):
        def index_side_effect(document):
            document.chunk_count = 1
            document.indexing_status = GroupDocument.IndexingStatus.INDEXED
            document.indexing_error = ''
            document.save(update_fields=['chunk_count', 'indexing_status', 'indexing_error', 'updated_at'])

        mock_index_document.side_effect = index_side_effect

        self.authenticate('admin@example.com', 'AdminPassword@123')
        for title, body in (
            ('Operations Guide', b'Severity 1 incidents require a 15 minute acknowledgement.'),
            ('Escalation Matrix', b'Escalations go to the incident commander.'),
        ):
            response = self.client.post(
                reverse('group_document_upload', kwargs={'group_id': self.group.id}),
                {
                    'title': title,
                    'description': '',
                    'file': SimpleUploadedFile(
                        f'{title.lower().replace(" ", "-")}.md',
                        body,
                        content_type='text/markdown',
                    ),
                },
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)

        documents = GroupDocument.objects.filter(group=self.group)
        self.assertEqual(documents.count(), 2)
        self.assertEqual(set(documents.values_list('title', flat=True)), {'Operations Guide', 'Escalation Matrix'})

    @patch('api.views.index_document')
    def test_group_admin_can_select_multiple_files_in_one_upload(self, mock_index_document):
        def index_side_effect(document):
            document.chunk_count = 1
            document.indexing_status = GroupDocument.IndexingStatus.INDEXED
            document.indexing_error = ''
            document.save(update_fields=['chunk_count', 'indexing_status', 'indexing_error', 'updated_at'])

        mock_index_document.side_effect = index_side_effect

        self.authenticate('admin@example.com', 'AdminPassword@123')
        response = self.client.post(
            reverse('group_document_upload', kwargs={'group_id': self.group.id}),
            {
                'description': 'Batch upload',
                'files': [
                    SimpleUploadedFile(
                        'operations.md',
                        b'Severity 1 incidents require a 15 minute acknowledgement.',
                        content_type='text/markdown',
                    ),
                    SimpleUploadedFile(
                        'matrix.md',
                        b'Escalations go to the incident commander.',
                        content_type='text/markdown',
                    ),
                ],
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(GroupDocument.objects.filter(group=self.group).count(), 2)
        self.assertEqual(len(response.data['uploaded_documents']), 2)
        self.assertEqual(len(response.data['documents']), 2)
