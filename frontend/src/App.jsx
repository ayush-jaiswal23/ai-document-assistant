import { useEffect, useState } from 'react'
import './App.css'
import { API_BASE_URL, API_MODE, SESSION_STORAGE_KEY, api } from './api'

const NAV_ITEMS = [
  { id: 'login', label: 'Login', public: true },
  { id: 'signup', label: 'Admin Sign Up', public: true },
  { id: 'chat', label: 'Chat', private: true },
  { id: 'profile', label: 'Profile', private: true },
]

function getInitialRoute() {
  return window.location.hash.replace('#', '') || 'login'
}

function readStoredSession() {
  try {
    const stored = window.localStorage.getItem(SESSION_STORAGE_KEY)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

function writeStoredSession(session) {
  if (!session) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

function formatDate(value) {
  if (!value) return 'No recent activity'
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getDocumentStatusTone(status) {
  if (status === 'indexed') return 'ready'
  if (status === 'failed') return 'failed'
  return 'pending'
}

function getDocumentStatusLabel(status, hasDocument) {
  if (!hasDocument) return 'Upload required'
  if (status === 'indexed') return 'Indexed in Chroma'
  if (status === 'failed') return 'Indexing failed'
  return 'Indexing pending'
}

function PasswordField({ label, value, onChange, visible, onToggle, placeholder, minLength }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="password-control">
        <input
          minLength={minLength}
          onChange={onChange}
          placeholder={placeholder}
          required
          type={visible ? 'text' : 'password'}
          value={value}
        />
        <button className="password-toggle" onClick={onToggle} type="button">
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </label>
  )
}

function App() {
  const [route, setRoute] = useState(getInitialRoute)
  const [session, setSession] = useState(readStoredSession)
  const [workspace, setWorkspace] = useState({ profile: null, groups: [] })
  const [adminMembers, setAdminMembers] = useState([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [chatState, setChatState] = useState({})
  const [authForm, setAuthForm] = useState({
    fullName: '',
    companyName: '',
    email: '',
    identifier: '',
    password: '',
    confirmPassword: '',
  })
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    title: '',
    bio: '',
    email: '',
  })
  const [draftMessage, setDraftMessage] = useState('')
  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    files: [],
  })
  const [memberForm, setMemberForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    title: '',
    bio: '',
    groupIds: [],
  })
  const [visiblePasswords, setVisiblePasswords] = useState({
    authPassword: false,
    authConfirmPassword: false,
    memberPassword: false,
    memberConfirmPassword: false,
  })
  const [pending, setPending] = useState({
    auth: false,
    workspace: false,
    profile: false,
    chat: false,
    upload: false,
    member: false,
    memberList: false,
  })
  const [notice, setNotice] = useState({
    type: 'info',
    message: 'Welcome, Please signup if you are new',
  })

  useEffect(() => {
    function handleHashChange() {
      setRoute(getInitialRoute())
    }
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
      return
    }

    setWorkspace({ profile: null, groups: [] })
    setAdminMembers([])
    setSelectedGroupId('')
    setChatState({})
    setProfileForm({ fullName: '', title: '', bio: '', email: '' })
  }, [session])

  const authMode = route === 'signup' ? 'signup' : 'login'

  async function loadWorkspace(activeSession, preferredGroupId = '') {
    setPending((current) => ({ ...current, workspace: true }))

    try {
      const nextWorkspace = await api.fetchWorkspace(activeSession.token)
      setWorkspace(nextWorkspace)
      setProfileForm({
        fullName: nextWorkspace.profile.fullName ?? '',
        title: nextWorkspace.profile.title ?? '',
        bio: nextWorkspace.profile.bio ?? '',
        email: nextWorkspace.profile.email ?? '',
      })

      if (nextWorkspace.profile.role === 'admin') {
        setPending((current) => ({ ...current, memberList: true }))
        try {
          setAdminMembers(await api.fetchMembers(activeSession.token))
        } finally {
          setPending((current) => ({ ...current, memberList: false }))
        }
      } else {
        setAdminMembers([])
      }

      const fallbackGroupId = preferredGroupId || nextWorkspace.groups[0]?.id || ''
      setSelectedGroupId((current) =>
        current && nextWorkspace.groups.some((group) => group.id === current)
          ? current
          : fallbackGroupId,
      )
      if (fallbackGroupId) await ensureGroupContext(activeSession.token, fallbackGroupId)
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
      if (API_MODE === 'backend') handleLogout()
    } finally {
      setPending((current) => ({ ...current, workspace: false }))
    }
  }

  async function ensureGroupContext(token, groupId) {
    if (chatState[groupId]?.loaded) return

    const context = await api.fetchGroupContext(token, groupId)
    setChatState((current) => ({
      ...current,
      [groupId]: {
        loaded: true,
        messages: context.messages,
        documents: context.documents,
      },
    }))
  }

  function navigate(nextRoute) {
    window.location.hash = nextRoute
  }

  function updateAuthForm(field, value) {
    setAuthForm((current) => ({ ...current, [field]: value }))
  }

  function updateProfileForm(field, value) {
    setProfileForm((current) => ({ ...current, [field]: value }))
  }

  function updateMemberForm(field, value) {
    setMemberForm((current) => ({ ...current, [field]: value }))
  }

  function updateUploadForm(field, value) {
    setUploadForm((current) => ({ ...current, [field]: value }))
  }

  function togglePassword(field) {
    setVisiblePasswords((current) => ({ ...current, [field]: !current[field] }))
  }

  function toggleMemberGroup(groupId) {
    setMemberForm((current) => ({
      ...current,
      groupIds: current.groupIds.includes(groupId)
        ? current.groupIds.filter((entry) => entry !== groupId)
        : [...current.groupIds, groupId],
    }))
  }

  async function handleAuthSubmit(event) {
    event.preventDefault()
    setPending((current) => ({ ...current, auth: true }))

    try {
      if (authMode === 'signup' && authForm.password !== authForm.confirmPassword) {
        throw new Error('Password confirmation does not match.')
      }

      const nextSession =
        authMode === 'signup'
          ? await api.signup({
              fullName: authForm.fullName,
              companyName: authForm.companyName,
              email: authForm.email,
              password: authForm.password,
            })
          : await api.login({
              identifier: authForm.identifier,
              password: authForm.password,
            })
      writeStoredSession(nextSession)
      setSession(nextSession)
      setAuthForm({
        fullName: '',
        companyName: '',
        email: '',
        identifier: '',
        password: '',
        confirmPassword: '',
      })
      setNotice({
        type: 'success',
        message: authMode === 'signup' ? 'Admin account created.' : 'Login successful.',
      })
      navigate('chat')
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setPending((current) => ({ ...current, auth: false }))
    }
  }

  async function handleMemberCreate(event) {
    event.preventDefault()
    if (!session) return

    if (memberForm.password !== memberForm.confirmPassword) {
      setNotice({ type: 'error', message: 'Member password confirmation does not match.' })
      return
    }
    if (!memberForm.groupIds.length) {
      setNotice({ type: 'error', message: 'Assign the new member to at least one group.' })
      return
    }

    setPending((current) => ({ ...current, member: true }))
    try {
      const createdMember = await api.createMember(session.token, memberForm)
      setAdminMembers(await api.fetchMembers(session.token))
      setMemberForm({
        fullName: '',
        email: '',
        password: '',
        confirmPassword: '',
        title: '',
        bio: '',
        groupIds: [],
      })
      setNotice({
        type: 'success',
        message: `Member created. Share member ID ${createdMember.memberId} with the user for login.`,
      })
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setPending((current) => ({ ...current, member: false }))
    }
  }

  async function handleLogout() {
    if (session && API_MODE === 'backend') {
      try {
        await api.logout(session.token, session.refresh)
      } catch {
        // Local session cleanup is still the correct fallback.
      }
    }
    writeStoredSession(null)
    setSession(null)
    setNotice({ type: 'info', message: 'Session cleared.' })
    navigate('login')
  }

  async function handleProfileSave(event) {
    event.preventDefault()
    if (!session) return
    setPending((current) => ({ ...current, profile: true }))

    try {
      const updatedProfile = await api.updateProfile(session.token, profileForm)
      setWorkspace((current) => ({ ...current, profile: updatedProfile }))
      setNotice({ type: 'success', message: 'Profile updated.' })
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setPending((current) => ({ ...current, profile: false }))
    }
  }

  async function handleGroupChange(groupId) {
    if (!session || !groupId) return
    setSelectedGroupId(groupId)
    try {
      await ensureGroupContext(session.token, groupId)
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    }
  }

  async function handleSendMessage(event) {
    event.preventDefault()
    if (!session || !selectedGroup || !draftMessage.trim()) return

    const nextMessage = draftMessage.trim()
    const optimisticMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: nextMessage,
      createdAt: new Date().toISOString(),
    }

    setDraftMessage('')
    setPending((current) => ({ ...current, chat: true }))
    setChatState((current) => ({
      ...current,
      [selectedGroup.id]: {
        ...current[selectedGroup.id],
        messages: [...(current[selectedGroup.id]?.messages ?? []), optimisticMessage],
      },
    }))

    try {
      const reply = await api.sendMessage(session.token, selectedGroup.id, nextMessage)
      setChatState((current) => ({
        ...current,
        [selectedGroup.id]: {
          ...current[selectedGroup.id],
          loaded: true,
          documents: reply.documents ?? current[selectedGroup.id]?.documents ?? [],
          messages: [...(current[selectedGroup.id]?.messages ?? []), reply.message],
        },
      }))
    } catch (error) {
      setChatState((current) => ({
        ...current,
        [selectedGroup.id]: {
          ...current[selectedGroup.id],
          messages: (current[selectedGroup.id]?.messages ?? []).filter(
            (message) => message.id !== optimisticMessage.id,
          ),
        },
      }))
      setDraftMessage(nextMessage)
      setNotice({ type: 'error', message: error.message })
    } finally {
      setPending((current) => ({ ...current, chat: false }))
    }
  }

  async function handleDocumentUpload(event) {
    event.preventDefault()
    if (!session || !selectedGroup || uploadForm.files.length === 0) {
      setNotice({ type: 'error', message: 'Choose at least one file before uploading.' })
      return
    }

    setPending((current) => ({ ...current, upload: true }))
    try {
      const response = await api.uploadDocument(session.token, selectedGroup.id, uploadForm)
      setChatState((current) => ({
        ...current,
        [selectedGroup.id]: {
          ...current[selectedGroup.id],
          loaded: true,
          documents: response.documents,
          messages: response.messages ?? current[selectedGroup.id]?.messages ?? [],
        },
      }))
      const latestDocument = response.documents[0] ?? response.document
      setWorkspace((current) => ({
        ...current,
        groups: current.groups.map((group) =>
          group.id === selectedGroup.id
            ? {
                ...group,
                hasDocument: true,
                documentCount: response.documents.length,
                documentTitle: latestDocument.title,
                documentStatus: latestDocument.indexingStatus,
                updatedAt: latestDocument.updatedAt,
              }
            : group,
        ),
      }))
      setUploadForm({ title: '', description: '', files: [] })
      setNotice({
        type: latestDocument.indexingStatus === 'indexed' ? 'success' : 'info',
        message: response.uploadErrors?.length
          ? `${response.uploadedDocuments.length} file(s) uploaded. ${response.uploadErrors.length} file(s) failed.`
          : `${response.uploadedDocuments.length} file(s) extracted, embedded with Gemini, and indexed in Chroma.`,
      })
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setPending((current) => ({ ...current, upload: false }))
    }
  }

  const selectedGroup = workspace.groups.find((group) => group.id === selectedGroupId) ?? null
  const selectedGroupState = selectedGroup ? chatState[selectedGroup.id] : null
  const messages = selectedGroupState?.messages ?? []
  const groupDocuments = selectedGroupState?.documents ?? []
  const activeDocument = groupDocuments[0] ?? null
  const indexedDocumentCount = groupDocuments.filter(
    (document) => document.indexingStatus === 'indexed',
  ).length
  const documentStatus = activeDocument?.indexingStatus ?? selectedGroup?.documentStatus ?? 'pending'
  const canUpload = selectedGroup?.role === 'admin'
  const canChat = Boolean(selectedGroup && indexedDocumentCount > 0)
  const isAuthenticated = Boolean(session)
  const isAdminUser = workspace.profile?.role === 'admin'
  const manageableGroups = workspace.groups.filter((group) => group.role === 'admin')

  return (
    <div className="app-shell">
      <aside className="hero-panel">
        <div className="brand-mark">Doc</div>
        <p className="eyebrow">Knowledge chat workspace</p>
        <h1>React chat app for document-grounded group conversations.</h1>
        <p className="hero-copy">
          Admins upload source files for each group. Members ask questions, and every
          answer stays anchored to the current document context.
        </p>
        <div className="hero-grid">
          <article>
            <span>01</span>
            <h2>Locked auth</h2>
            <p>JWT login, session refresh, and role-scoped profile access.</p>
          </article>
          <article>
            <span>02</span>
            <h2>Role aware</h2>
            <p>Only group admins can upload documents and create member identities.</p>
          </article>
          <article>
            <span>03</span>
            <h2>Group scoped</h2>
            <p>Members can only chat with document data from groups they belong to.</p>
          </article>
        </div>
        <div className="mode-card">
          <p>API mode</p>
          <strong>{API_MODE === 'demo' ? 'Demo data' : 'Backend API'}</strong>
          <span>{API_MODE === 'demo' ? 'Runs without a server.' : API_BASE_URL}</span>
        </div>
      </aside>

      <main className="workspace-panel">
        <header className="topbar">
          <nav className="topbar-nav" aria-label="Primary">
            {NAV_ITEMS.filter((item) => (isAuthenticated ? item.private : item.public)).map(
              (item) => (
                <button
                  key={item.id}
                  className={route === item.id ? 'nav-item active' : 'nav-item'}
                  onClick={() => navigate(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ),
            )}
          </nav>

          {isAuthenticated ? (
            <div className="session-chip">
              <div>
                <strong>{workspace.profile?.fullName}</strong>
                <span>
                  {workspace.profile?.role === 'admin'
                    ? workspace.profile?.email
                    : workspace.profile?.memberId || workspace.profile?.email}
                </span>
              </div>
              <button className="ghost-button" onClick={handleLogout} type="button">
                Logout
              </button>
            </div>
          ) : null}
        </header>

        <div className={`notice-banner ${notice.type}`}>{notice.message}</div>

        {!isAuthenticated && (route === 'login' || route === 'signup') ? (
          <section className="auth-layout">
            <div className="section-heading">
              <p>{authMode === 'signup' ? 'Start a trial workspace' : 'Secure access'}</p>
              <h2>
                {authMode === 'signup'
                  ? 'Create an admin account for your company'
                  : 'Login with your email or member ID'}
              </h2>
            </div>
            <form className="panel auth-panel" onSubmit={handleAuthSubmit}>
              {authMode === 'signup' ? (
                <>
                  <label className="field">
                    <span>Full name</span>
                    <input
                      onChange={(event) => updateAuthForm('fullName', event.target.value)}
                      placeholder="Avery Singh"
                      required
                      value={authForm.fullName}
                    />
                  </label>
                  <label className="field">
                    <span>Company name</span>
                    <input
                      onChange={(event) => updateAuthForm('companyName', event.target.value)}
                      placeholder="Acme Support"
                      required
                      value={authForm.companyName}
                    />
                  </label>
                  <label className="field">
                    <span>Admin email</span>
                    <input
                      onChange={(event) => updateAuthForm('email', event.target.value)}
                      placeholder="admin@company.com"
                      required
                      type="email"
                      value={authForm.email}
                    />
                  </label>
                </>
              ) : (
                <label className="field">
                  <span>Email or member ID</span>
                  <input
                    onChange={(event) => updateAuthForm('identifier', event.target.value)}
                    placeholder="admin@company.com or MEM-OPS-0001"
                    required
                    value={authForm.identifier}
                  />
                </label>
              )}
              <PasswordField
                label="Password"
                onChange={(event) => updateAuthForm('password', event.target.value)}
                onToggle={() => togglePassword('authPassword')}
                placeholder="Enter your password"
                value={authForm.password}
                visible={visiblePasswords.authPassword}
              />
              {authMode === 'signup' ? (
                <PasswordField
                  label="Confirm password"
                  onChange={(event) => updateAuthForm('confirmPassword', event.target.value)}
                  onToggle={() => togglePassword('authConfirmPassword')}
                  placeholder="Repeat your password"
                  value={authForm.confirmPassword}
                  visible={visiblePasswords.authConfirmPassword}
                />
              ) : null}
              <button className="primary-button" disabled={pending.auth} type="submit">
                {pending.auth
                  ? 'Submitting...'
                  : authMode === 'signup'
                    ? 'Create admin account'
                    : 'Login'}
              </button>
            </form>
            <div className="panel switcher-panel">
              <p>
                {authMode === 'signup'
                  ? 'Members are still created by admins after signup.'
                  : 'New companies can create an admin account here.'}
              </p>
              <button
                className="ghost-button"
                onClick={() => navigate(authMode === 'signup' ? 'login' : 'signup')}
                type="button"
              >
                {authMode === 'signup' ? 'Back to login' : 'Create admin account'}
              </button>
            </div>
          </section>
        ) : null}

        {isAuthenticated && route === 'profile' ? (
          <section className="profile-layout">
            <div className="section-heading">
              <p>Profile settings</p>
              <h2>Keep your identity current for group collaboration</h2>
            </div>
            <form className="panel profile-panel" onSubmit={handleProfileSave}>
              <label className="field">
                <span>Full name</span>
                <input
                  onChange={(event) => updateProfileForm('fullName', event.target.value)}
                  value={profileForm.fullName}
                />
              </label>
              <label className="field">
                <span>Title</span>
                <input
                  onChange={(event) => updateProfileForm('title', event.target.value)}
                  value={profileForm.title}
                />
              </label>
              <label className="field">
                <span>Email</span>
                <input disabled type="email" value={profileForm.email} />
              </label>
              <label className="field">
                <span>Bio</span>
                <textarea
                  onChange={(event) => updateProfileForm('bio', event.target.value)}
                  rows="5"
                  value={profileForm.bio}
                />
              </label>
              <button className="primary-button" disabled={pending.profile} type="submit">
                {pending.profile ? 'Saving...' : 'Save profile'}
              </button>
            </form>

            {isAdminUser ? (
              <form className="panel profile-panel" onSubmit={handleMemberCreate}>
                <div className="section-heading compact">
                  <p>Admin controls</p>
                  <h2>Create a member login</h2>
                </div>
                <label className="field">
                  <span>Full name</span>
                  <input
                    onChange={(event) => updateMemberForm('fullName', event.target.value)}
                    required
                    value={memberForm.fullName}
                  />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input
                    onChange={(event) => updateMemberForm('email', event.target.value)}
                    required
                    type="email"
                    value={memberForm.email}
                  />
                </label>
                <PasswordField
                  label="Password"
                  minLength="12"
                  onChange={(event) => updateMemberForm('password', event.target.value)}
                  onToggle={() => togglePassword('memberPassword')}
                  value={memberForm.password}
                  visible={visiblePasswords.memberPassword}
                />
                <PasswordField
                  label="Confirm password"
                  minLength="12"
                  onChange={(event) => updateMemberForm('confirmPassword', event.target.value)}
                  onToggle={() => togglePassword('memberConfirmPassword')}
                  value={memberForm.confirmPassword}
                  visible={visiblePasswords.memberConfirmPassword}
                />
                <label className="field">
                  <span>Title</span>
                  <input
                    onChange={(event) => updateMemberForm('title', event.target.value)}
                    value={memberForm.title}
                  />
                </label>
                <label className="field">
                  <span>Bio</span>
                  <textarea
                    onChange={(event) => updateMemberForm('bio', event.target.value)}
                    rows="4"
                    value={memberForm.bio}
                  />
                </label>
                <fieldset className="field checkbox-field">
                  <legend>Assign groups</legend>
                  <div className="checkbox-grid">
                    {manageableGroups.map((group) => (
                      <label key={group.id} className="checkbox-card">
                        <input
                          checked={memberForm.groupIds.includes(group.id)}
                          onChange={() => toggleMemberGroup(group.id)}
                          type="checkbox"
                        />
                        <span>{group.name}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <button className="primary-button" disabled={pending.member} type="submit">
                  {pending.member ? 'Creating...' : 'Create member'}
                </button>
              </form>
            ) : null}

            {isAdminUser ? (
              <section className="panel member-list-panel">
                <div className="section-heading compact">
                  <p>Group members</p>
                  <h2>Members you manage</h2>
                </div>
                {pending.memberList ? (
                  <div className="empty-card">Loading members...</div>
                ) : adminMembers.length ? (
                  <div className="member-list">
                    {adminMembers.map((member) => (
                      <article className="member-card" key={member.id}>
                        <div>
                          <strong>{member.fullName}</strong>
                          <span>{member.memberId || member.email}</span>
                        </div>
                        <small>{member.groups.map((group) => group.name).join(', ')}</small>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-card">No member accounts have been created for your groups.</div>
                )}
              </section>
            ) : null}
          </section>
        ) : null}

        {isAuthenticated && route === 'chat' ? (
          <section className="chat-layout">
            <div className="sidebar-stack">
              <section className="panel group-panel">
                <div className="section-heading compact">
                  <p>Groups</p>
                  <h2>Your workspaces</h2>
                </div>
                <div className="group-list">
                  {workspace.groups.map((group) => (
                    <button
                      key={group.id}
                      className={selectedGroupId === group.id ? 'group-item active' : 'group-item'}
                      onClick={() => handleGroupChange(group.id)}
                      type="button"
                    >
                      <div>
                        <strong>{group.name}</strong>
                        <span>{group.role}</span>
                      </div>
                      <small>
                        {group.hasDocument
                          ? `${group.documentCount ?? 1} document${(group.documentCount ?? 1) === 1 ? '' : 's'} - ${getDocumentStatusLabel(group.documentStatus, true)}`
                          : 'No document yet'}
                      </small>
                    </button>
                  ))}
                </div>
              </section>

              {selectedGroup ? (
                <section className="panel doc-panel">
                  <div className="section-heading compact">
                    <p>Knowledge base</p>
                    <h2>{selectedGroup.name}</h2>
                  </div>
                  <div className="doc-meta">
                    <span className={`pill ${selectedGroup.role}`}>{selectedGroup.role}</span>
                    <span
                      className={`pill ${getDocumentStatusTone(
                        selectedGroup.hasDocument ? documentStatus : 'pending',
                      )}`}
                    >
                      {getDocumentStatusLabel(documentStatus, selectedGroup.hasDocument)}
                    </span>
                    {selectedGroup.hasDocument ? (
                      <span className="pill ready">
                        {indexedDocumentCount} indexed / {groupDocuments.length} total
                      </span>
                    ) : null}
                  </div>

                  {activeDocument ? (
                    <div className="document-list">
                      {groupDocuments.map((document) => (
                        <div className="doc-preview" key={document.id}>
                          <h3>{document.title}</h3>
                          <p>{document.summary}</p>
                          <dl>
                            <div>
                              <dt>Uploaded</dt>
                              <dd>{formatDate(document.updatedAt)}</dd>
                            </div>
                            <div>
                              <dt>Source</dt>
                              <dd>{document.fileName}</dd>
                            </div>
                            <div>
                              <dt>Uploaded by</dt>
                              <dd>{document.uploadedBy}</dd>
                            </div>
                          </dl>
                          {document.indexingError ? (
                            <div className="doc-alert failed">{document.indexingError}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-card">
                      <h3>No documents indexed</h3>
                      <p>
                        Members cannot chat in this group until an admin uploads source
                        documents.
                      </p>
                    </div>
                  )}

                  {canUpload ? (
                    <form className="upload-form" onSubmit={handleDocumentUpload}>
                      <label className="field">
                        <span>Document title</span>
                        <input
                          onChange={(event) => updateUploadForm('title', event.target.value)}
                          placeholder="Quarterly support handbook"
                          value={uploadForm.title}
                        />
                      </label>
                      <label className="field">
                        <span>Description</span>
                        <textarea
                          onChange={(event) => updateUploadForm('description', event.target.value)}
                          placeholder="Explain what this document covers"
                          rows="3"
                          value={uploadForm.description}
                        />
                      </label>
                      <label className="field file-field">
                        <span>Upload documents</span>
                        <input
                          accept=".txt,.md,.pdf"
                          multiple
                          onChange={(event) =>
                            updateUploadForm('files', Array.from(event.target.files ?? []))
                          }
                          type="file"
                        />
                      </label>
                      {uploadForm.files.length ? (
                        <div className="selected-files">
                          {uploadForm.files.map((file) => (
                            <span key={`${file.name}-${file.size}`}>{file.name}</span>
                          ))}
                        </div>
                      ) : null}
                      <button className="primary-button" disabled={pending.upload} type="submit">
                        {pending.upload ? 'Uploading...' : 'Upload and index'}
                      </button>
                    </form>
                  ) : (
                    <div className="member-hint">Only admins can upload documents for this group.</div>
                  )}
                </section>
              ) : null}
            </div>

            <section className="panel chat-panel">
              <div className="chat-header">
                <div>
                  <p>Document chat</p>
                  <h2>{selectedGroup ? `${selectedGroup.name} assistant` : 'Choose a group'}</h2>
                </div>
                {pending.workspace ? <span className="status-dot">Refreshing...</span> : null}
              </div>
              <div className="message-stream">
                {messages.length ? (
                  messages.map((message) => (
                    <article key={message.id} className={`message-card ${message.role}`}>
                      <header>
                        <strong>{message.role === 'assistant' ? 'Assistant' : 'You'}</strong>
                        <span>{formatDate(message.createdAt)}</span>
                      </header>
                      <p>{message.content}</p>
                    </article>
                  ))
                ) : (
                  <div className="empty-card">
                    <h3>No messages yet</h3>
                    <p>Start the conversation once this group has an indexed document.</p>
                  </div>
                )}
              </div>
              <form className="composer" onSubmit={handleSendMessage}>
                <textarea
                  disabled={!canChat || pending.chat}
                  onChange={(event) => setDraftMessage(event.target.value)}
                  placeholder={
                    canChat
                      ? 'Ask about the uploaded documents'
                      : activeDocument
                        ? 'Chat stays locked until indexing completes successfully'
                        : 'Chat stays locked until an admin uploads documents'
                  }
                  rows="4"
                  value={draftMessage}
                />
                <div className="composer-footer">
                  <span>
                    {canChat
                      ? 'Responses are limited to indexed group documents in Chroma.'
                      : activeDocument
                        ? 'No uploaded group document is ready for retrieval yet.'
                        : 'Document access is required before members can chat.'}
                  </span>
                  <button
                    className="primary-button"
                    disabled={!canChat || pending.chat || !draftMessage.trim()}
                    type="submit"
                  >
                    {pending.chat ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </form>
            </section>
          </section>
        ) : null}
      </main>
    </div>
  )
}

export default App
