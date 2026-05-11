from django.contrib.auth import authenticate, get_user_model, password_validation
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import ChatMessage, Group, GroupDocument, GroupMembership

User = get_user_model()


class UserSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'full_name', 'email', 'member_id', 'role', 'company_name', 'title', 'bio']


class AdminMemberSerializer(serializers.ModelSerializer):
    groups = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'full_name', 'email', 'member_id', 'role', 'title', 'bio', 'groups']

    def get_groups(self, obj):
        admin_group_ids = self.context.get('admin_group_ids', set())
        return [
            {'id': membership.group_id, 'name': membership.group.name}
            for membership in obj.memberships.all()
            if membership.group_id in admin_group_ids
        ]


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        identifier = attrs['identifier'].strip()
        password = attrs['password']
        user = User.objects.filter(member_id__iexact=identifier).first()

        if user is None:
            user = authenticate(
                request=self.context.get('request'),
                username=identifier,
                password=password,
            )
        elif not user.check_password(password):
            user = None

        if user is None:
            raise serializers.ValidationError('Invalid credentials.')
        if not user.is_active:
            raise serializers.ValidationError('This account is inactive.')

        attrs['user'] = user
        return attrs


class AppTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['member_id'] = user.member_id or ''
        return token


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'full_name', 'email', 'member_id', 'role', 'company_name', 'title', 'bio']
        read_only_fields = ['id', 'email', 'member_id', 'role']


class AdminSignupSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=255)
    company_name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=12)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value

    def create(self, validated_data):
        company_name = validated_data.pop('company_name')
        user = User.objects.create_user(
            role=User.Role.ADMIN,
            company_name=company_name,
            **validated_data,
        )
        GroupMembership.objects.create(
            user=user,
            group=self._create_default_group(company_name),
            role=GroupMembership.Role.ADMIN,
        )
        return user

    def _create_default_group(self, company_name):
        base_name = f'{company_name.strip()} Workspace'
        candidate = base_name
        suffix = 1
        while Group.objects.filter(name__iexact=candidate).exists():
            suffix += 1
            candidate = f'{base_name} {suffix}'
        return Group.objects.create(
            name=candidate,
            description=f'Primary document workspace for {company_name.strip()}.',
        )


class GroupDocumentSerializer(serializers.ModelSerializer):
    uploaded_by = serializers.CharField(source='uploaded_by.full_name', read_only=True)
    file_name = serializers.SerializerMethodField()
    summary = serializers.SerializerMethodField()

    class Meta:
        model = GroupDocument
        fields = [
            'id',
            'title',
            'description',
            'summary',
            'file_name',
            'uploaded_by',
            'embedding_model',
            'vector_store_backend',
            'chunk_count',
            'indexing_status',
            'indexing_error',
            'indexed_at',
            'updated_at',
        ]

    def get_file_name(self, obj):
        return obj.file.name.rsplit('/', 1)[-1]

    def get_summary(self, obj):
        if obj.description:
            return obj.description
        preview = obj.extracted_text.strip()
        return preview[:180] + ('...' if len(preview) > 180 else '')


class GroupSummarySerializer(serializers.ModelSerializer):
    role = serializers.CharField()
    documents = GroupDocumentSerializer(many=True, read_only=True)

    class Meta:
        model = Group
        fields = ['id', 'name', 'description', 'role', 'documents']


class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ['id', 'role', 'content', 'created_at']


class GroupDetailSerializer(serializers.ModelSerializer):
    role = serializers.CharField()
    documents = GroupDocumentSerializer(many=True, read_only=True)
    messages = ChatMessageSerializer(many=True, read_only=True)

    class Meta:
        model = Group
        fields = ['id', 'name', 'description', 'role', 'documents', 'messages']


class MemberCreateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=12)
    title = serializers.CharField(max_length=255, allow_blank=True, required=False)
    bio = serializers.CharField(allow_blank=True, required=False)
    group_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
        write_only=True,
    )

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value

    def validate_group_ids(self, value):
        groups = list(Group.objects.filter(id__in=value))
        if len(groups) != len(set(value)):
            raise serializers.ValidationError('One or more groups are invalid.')

        request_user = self.context['request'].user
        admin_group_ids = set(
            GroupMembership.objects.filter(
                user=request_user,
                role=GroupMembership.Role.ADMIN,
                group_id__in=value,
            ).values_list('group_id', flat=True)
        )
        requested = set(value)
        if admin_group_ids != requested:
            raise serializers.ValidationError('You can only create members inside groups you administer.')
        return value

    def create(self, validated_data):
        group_ids = validated_data.pop('group_ids')
        member_id = self._build_member_id(validated_data['full_name'])
        user = User.objects.create_user(
            role=User.Role.MEMBER,
            member_id=member_id,
            **validated_data,
        )

        memberships = [
            GroupMembership(user=user, group_id=group_id, role=GroupMembership.Role.MEMBER)
            for group_id in group_ids
        ]
        GroupMembership.objects.bulk_create(memberships)
        return user

    def _build_member_id(self, full_name):
        base = ''.join(ch.lower() for ch in full_name if ch.isalnum())[:10] or 'member'
        suffix = 1
        while True:
            candidate = f'MEM-{base[:6].upper()}-{suffix:04d}'
            if not User.objects.filter(member_id=candidate).exists():
                return candidate
            suffix += 1


class DocumentUploadSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255, required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    file = serializers.FileField(required=False)


class ChatRequestSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=4000)
    scope = serializers.CharField(required=False, allow_blank=True)
