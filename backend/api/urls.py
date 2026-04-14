from django.urls import path

from .views import (
    AdminSignupView,
    GroupChatView,
    GroupDetailView,
    GroupDocumentUploadView,
    GroupListView,
    LoginView,
    LogoutView,
    MemberCreateView,
    ProfileView,
    RefreshView,
)

urlpatterns = [
    path('api/auth/signup/', AdminSignupView.as_view(), name='signup'),
    path('api/auth/login/', LoginView.as_view(), name='login'),
    path('api/auth/refresh/', RefreshView.as_view(), name='token_refresh'),
    path('api/auth/logout/', LogoutView.as_view(), name='logout'),
    path('api/profile/', ProfileView.as_view(), name='profile'),
    path('api/groups/', GroupListView.as_view(), name='groups'),
    path('api/groups/<int:group_id>/', GroupDetailView.as_view(), name='group_detail'),
    path('api/groups/<int:group_id>/documents/upload/', GroupDocumentUploadView.as_view(), name='group_document_upload'),
    path('api/groups/<int:group_id>/chat/', GroupChatView.as_view(), name='group_chat'),
    path('api/members/', MemberCreateView.as_view(), name='member_create'),
]
