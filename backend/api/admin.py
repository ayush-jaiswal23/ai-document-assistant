from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import ChatMessage, Group, GroupDocument, GroupMembership, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ('email',)
    list_display = ('email', 'full_name', 'role', 'member_id', 'is_staff', 'is_active')
    search_fields = ('email', 'full_name', 'member_id')
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Profile', {'fields': ('full_name', 'member_id', 'role', 'company_name', 'title', 'bio')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Dates', {'fields': ('last_login',)}),
    )
    add_fieldsets = (
        (
            None,
            {
                'classes': ('wide',),
                'fields': ('email', 'full_name', 'password1', 'password2', 'role', 'is_staff', 'is_superuser'),
            },
        ),
    )


@admin.register(Group)
class GroupAdmin(admin.ModelAdmin):
    list_display = ('name', 'updated_at')
    search_fields = ('name',)


@admin.register(GroupMembership)
class GroupMembershipAdmin(admin.ModelAdmin):
    list_display = ('user', 'group', 'role', 'created_at')
    list_filter = ('role', 'group')
    search_fields = ('user__email', 'user__full_name', 'group__name')


@admin.register(GroupDocument)
class GroupDocumentAdmin(admin.ModelAdmin):
    list_display = ('group', 'title', 'uploaded_by', 'indexing_status', 'chunk_count', 'updated_at')
    list_filter = ('indexing_status', 'vector_store_backend', 'embedding_model')
    search_fields = ('group__name', 'title', 'uploaded_by__email', 'chroma_collection_name')


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ('group', 'role', 'user', 'created_at')
    list_filter = ('role', 'group')
    search_fields = ('group__name', 'content', 'user__email')
