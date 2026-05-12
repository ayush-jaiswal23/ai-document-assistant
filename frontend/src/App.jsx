import { useEffect, useState, useCallback } from 'react'
import './App.css'
import { API_MODE, api } from './api'
import { HeroPanel } from './components/layout/HeroPanel'
import { Topbar } from './components/layout/Topbar'
import { AuthLayout } from './components/auth/AuthLayout'
import { ProfileLayout } from './components/profile/ProfileLayout'
import { ChatLayout } from './components/chat/ChatLayout'
import { useAuth } from './hooks/useAuth'
import { useWorkspace } from './hooks/useWorkspace'
import { useChat } from './hooks/useChat'
import { useProfile } from './hooks/useProfile'
import { getInitialRoute, navigate } from './utils/navigation'
import { readStoredSession, writeStoredSession } from './utils/storage'

const NAV_ITEMS = [
  { id: 'login', label: 'Login', public: true },
  { id: 'signup', label: 'Admin Sign Up', public: true },
  { id: 'chat', label: 'Chat', private: true },
  { id: 'profile', label: 'Profile', private: true },
]

function App() {
  const [route, setRoute] = useState(getInitialRoute)
  const [session, setSession] = useState(readStoredSession)
  const [notice, setNotice] = useState({
    type: 'info',
    message: 'Welcome, Please signup if you are new',
  })

  const handleLogout = useCallback(async () => {
    if (session && API_MODE === 'backend') {
      try {
        await api.logout(session.token, session.refresh)
      } catch {
        // Fallback to local cleanup
      }
    }
    writeStoredSession(null)
    setSession(null)
    setNotice({ type: 'info', message: 'Session cleared.' })
    navigate('login')
  }, [session])

  const {
    workspace,
    setWorkspace,
    adminMembers,
    setAdminMembers,
    selectedGroupId,
    setSelectedGroupId,
    pending: pendingWorkspace,
    loadWorkspace,
  } = useWorkspace(session, setNotice, handleLogout)

  const selectedGroup = workspace.groups.find((group) => group.id === selectedGroupId) ?? null

  const {
    authForm,
    authMode,
    visiblePasswords: authVisiblePasswords,
    pending: pendingAuth,
    updateAuthForm,
    togglePassword: toggleAuthPassword,
    handleAuthSubmit,
  } = useAuth(session, setSession, setNotice, route)

  const {
    chatState,
    setChatState,
    draftMessage,
    setDraftMessage,
    uploadForm,
    setUploadForm,
    pending: pendingChat,
    ensureGroupContext,
    handleSendMessage,
    handleDocumentUpload,
  } = useChat(session, selectedGroup, setNotice, setWorkspace)

  const {
    profileForm,
    updateProfileForm,
    handleProfileSave,
    memberForm,
    updateMemberForm,
    handleMemberCreate,
    visiblePasswords: profileVisiblePasswords,
    togglePassword: toggleProfilePassword,
    toggleMemberGroup,
    pending: pendingProfile,
  } = useProfile(session, workspace, setWorkspace, setNotice, setAdminMembers)

  useEffect(() => {
    const handleHashChange = () => setRoute(getInitialRoute())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    if (!NAV_ITEMS.some((item) => item.id === route)) {
      navigate(session ? 'chat' : 'login')
    }
  }, [route, session])

  useEffect(() => {
    if (session) {
      loadWorkspace(session, selectedGroupId)
    } else {
      setWorkspace({ profile: null, groups: [] })
      setAdminMembers([])
      setSelectedGroupId('')
      setChatState({})
    }
    // We only want to trigger this on session change (login/logout).
    // selectedGroupId is passed but NOT as a dependency to avoid loops.
  }, [session, loadWorkspace, setWorkspace, setAdminMembers, setSelectedGroupId, setChatState])

  useEffect(() => {
    if (session && selectedGroupId) {
      ensureGroupContext(session.token, selectedGroupId)
    }
  }, [session, selectedGroupId, ensureGroupContext])

  const handleGroupChange = async (groupId) => {
    if (!session || !groupId) return
    setSelectedGroupId(groupId)
    try {
      await ensureGroupContext(session.token, groupId)
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    }
  }

  const isAuthenticated = Boolean(session)
  const isAdminUser = workspace.profile?.role === 'admin'
  const manageableGroups = workspace.groups.filter((group) => group.role === 'admin')
  const selectedGroupState = selectedGroup ? chatState[selectedGroup.id] : null
  const messages = selectedGroupState?.messages ?? []
  const groupDocuments = selectedGroupState?.documents ?? []
  const indexedDocumentCount = groupDocuments.filter(
    (doc) => doc.indexingStatus === 'indexed',
  ).length
  const documentStatus = groupDocuments[0]?.indexingStatus ?? selectedGroup?.documentStatus ?? 'pending'
  const canChat = Boolean(selectedGroup && indexedDocumentCount > 0)

  return (
    <div className="app-shell">
      <HeroPanel />

      <main className="workspace-panel">
        <Topbar
          isAuthenticated={isAuthenticated}
          navItems={NAV_ITEMS}
          onLogout={handleLogout}
          onNavigate={navigate}
          profile={workspace.profile}
          route={route}
        />

        <div className={`notice-banner ${notice.type}`}>{notice.message}</div>

        {!isAuthenticated && (route === 'login' || route === 'signup') && (
          <AuthLayout
            authForm={authForm}
            authMode={authMode}
            onAuthSubmit={handleAuthSubmit}
            onNavigate={navigate}
            pending={pendingAuth}
            togglePassword={toggleAuthPassword}
            updateAuthForm={updateAuthForm}
            visiblePasswords={authVisiblePasswords}
          />
        )}

        {isAuthenticated && route === 'profile' && (
          <ProfileLayout
            adminMembers={adminMembers}
            isAdminUser={isAdminUser}
            manageableGroups={manageableGroups}
            memberForm={memberForm}
            onMemberCreate={handleMemberCreate}
            onProfileSave={handleProfileSave}
            pending={pendingProfile}
            pendingMemberList={pendingWorkspace.memberList}
            profileForm={profileForm}
            toggleMemberGroup={toggleMemberGroup}
            togglePassword={toggleProfilePassword}
            updateMemberForm={updateMemberForm}
            updateProfileForm={updateProfileForm}
            visiblePasswords={profileVisiblePasswords}
          />
        )}

        {isAuthenticated && route === 'chat' && (
          <ChatLayout
            canChat={canChat}
            canUpload={selectedGroup?.role === 'admin'}
            documentStatus={documentStatus}
            draftMessage={draftMessage}
            groupDocuments={groupDocuments}
            indexedDocumentCount={indexedDocumentCount}
            messages={messages}
            onDocumentUpload={handleDocumentUpload}
            onGroupChange={handleGroupChange}
            onSendMessage={handleSendMessage}
            pending={pendingChat}
            selectedGroup={selectedGroup}
            selectedGroupId={selectedGroupId}
            setDraftMessage={setDraftMessage}
            updateUploadForm={(field, value) =>
              setUploadForm((curr) => ({ ...curr, [field]: value }))
            }
            uploadForm={uploadForm}
            workspace={workspace}
          />
        )}
      </main>
    </div>
  )
}

export default App
