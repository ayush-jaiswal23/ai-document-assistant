from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.core.validators import FileExtensionValidator
from django.db import models
from django.utils import timezone

# Creates regular and superuser accounts because this project authenticates with email instead of username.
class UserManager(BaseUserManager):
    # Normalizes email and applies the shared user defaults so every account is created consistently.
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required.')

        email = self.normalize_email(email)
        extra_fields.setdefault('is_active', True)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    # Enforces the admin-only flags required by Django for superuser access.
    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('role', User.Role.ADMIN)
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)

        if extra_fields.get('role') != User.Role.ADMIN:
            raise ValueError('Superuser must have admin role.')
        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        return self.create_user(email, password, **extra_fields)

# Stores the authenticated person profile because the app needs both admins and member-only identities.
class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        ADMIN = 'admin', 'Admin'
        MEMBER = 'member', 'Member'

    full_name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    member_id = models.CharField(max_length=32, unique=True, null=True, blank=True)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.MEMBER)
    company_name = models.CharField(max_length=255, blank=True)
    title = models.CharField(max_length=255, blank=True)
    bio = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name']

    # Returns the email because it is the primary login identifier and most useful admin label.
    def __str__(self):
        return self.email


# Represents a company workspace or team chat boundary because documents and messages are scoped per group.
class Group(models.Model):
    name = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Returns the group name because it is the clearest human-readable workspace identifier.
    def __str__(self):
        return self.name


# Connects users to groups with a per-group role because global roles alone are not enough for access control.
class GroupMembership(models.Model):
    class Role(models.TextChoices):
        ADMIN = 'admin', 'Admin'
        MEMBER = 'member', 'Member'

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='memberships')
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name='memberships')
    role = models.CharField(max_length=16, choices=Role.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user', 'group'], name='unique_group_membership'),
        ]

    # Returns a readable membership summary to make admin screens and logs easier to inspect.
    def __str__(self):
        return f'{self.user.email} -> {self.group.name} ({self.role})'


# Builds a timestamped upload path so replacements do not collide and files stay grouped by workspace.
def document_upload_path(instance, filename):
    return f'group_documents/{instance.group_id}/{timezone.now():%Y%m%d%H%M%S}_{filename}'


# Stores each uploaded source document and its indexing metadata because Chroma state must be reflected per file.
class GroupDocument(models.Model):
    class IndexingStatus(models.TextChoices):
        PENDING = 'pending', 'Pending'
        INDEXED = 'indexed', 'Indexed'
        FAILED = 'failed', 'Failed'

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name='documents')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    file = models.FileField(
        upload_to=document_upload_path,
        validators=[FileExtensionValidator(['txt', 'md', 'pdf'])],
    )
    extracted_text = models.TextField()
    embedding_model = models.CharField(max_length=64, default='gemini-embedding-001')
    vector_store_backend = models.CharField(max_length=32, default='chroma')
    chroma_collection_name = models.CharField(max_length=255, unique=True)
    source_mime_type = models.CharField(max_length=255, blank=True)
    chunk_count = models.PositiveIntegerField(default=0)
    indexing_status = models.CharField(
        max_length=16,
        choices=IndexingStatus.choices,
        default=IndexingStatus.PENDING,
    )
    indexing_error = models.TextField(blank=True)
    indexed_at = models.DateTimeField(null=True, blank=True)
    uploaded_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='uploaded_documents')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Returns a compact document label because group-scoped titles are easier to identify in admin and debugging.
    def __str__(self):
        return f'{self.group.name}: {self.title}'


# Persists the chat transcript because members need an auditable history of document-grounded conversations.
class ChatMessage(models.Model):
    class Role(models.TextChoices):
        USER = 'user', 'User'
        ASSISTANT = 'assistant', 'Assistant'

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name='messages')
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='messages')
    role = models.CharField(max_length=16, choices=Role.choices)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']

    # Returns the group and speaker role because that is the most useful quick summary for message rows.
    def __str__(self):
        return f'{self.group.name} [{self.role}]'
