from django.test import TestCase
from django.utils import timezone
from unittest.mock import MagicMock, patch
from api.services import build_answer_cache_key, answer_question, RELEVANCE_THRESHOLD
from api.models import GroupDocument, Group, User
from django.core.cache import cache

class ServiceTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(email='test@example.com', password='password', full_name='Test User')
        self.group = Group.objects.create(name='Test Group')
        self.document = GroupDocument.objects.create(
            group=self.group,
            title='Test Doc',
            extracted_text='This is a test document about artificial intelligence.',
            indexing_status=GroupDocument.IndexingStatus.INDEXED,
            uploaded_by=self.user,
            chroma_collection_name='test-collection',
            chunk_count=1
        )

    def test_build_answer_cache_key_hashing(self):
        updated_at = timezone.now()
        question = 'What is AI?'
        key1 = build_answer_cache_key(1, updated_at, 'what is ai?')
        key2 = build_answer_cache_key(1, updated_at, 'what is ai?')
        
        self.assertEqual(key1, key2)
        self.assertNotIn(' ', key1)
        self.assertIn('doc-answer:1:', key1)

    @patch('api.services.get_vector_store')
    def test_answer_question_low_relevance(self, mock_get_vector_store):
        mock_vs = MagicMock()
        # Mock similarity_search_with_relevance_scores to return a low score
        mock_doc = MagicMock()
        mock_doc.page_content = 'Some irrelevant text'
        mock_vs.similarity_search_with_relevance_scores.return_value = [(mock_doc, 0.1)]
        mock_get_vector_store.return_value = mock_vs

        answer = answer_question(self.document, 'What is the capital of France?')
        
        self.assertIn('I could not find any relevant information', answer)
        self.assertIn(self.document.title, answer)

    @patch('api.services.get_vector_store')
    def test_answer_question_high_relevance(self, mock_get_vector_store):
        mock_vs = MagicMock()
        # Mock similarity_search_with_relevance_scores to return a high score
        mock_doc = MagicMock()
        mock_doc.page_content = 'Artificial intelligence is the simulation of human intelligence by machines.'
        mock_vs.similarity_search_with_relevance_scores.return_value = [(mock_doc, 0.9)]
        mock_get_vector_store.return_value = mock_vs

        answer = answer_question(self.document, 'What is AI?')
        
        self.assertIn('Based on "Test Doc"', answer)
        self.assertIn('artificial intelligence', answer.lower())
