const DEMO_STORAGE_KEY = 'doc-chat-demo-db'
export const SESSION_STORAGE_KEY = 'doc-chat-session'

export const API_MODE =
  (import.meta.env.VITE_API_MODE ?? 'backend').toLowerCase() === 'demo' ? 'demo' : 'backend'

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(
  /\/$/,
  '',
)

function createSeededDemoDb() {
  return {
    users: [
      {
        id: 'user-admin',
        fullName: 'Avery Admin',
        email: 'admin@docchat.dev',
        memberId: null,
        role: 'admin',
        password: 'Admin@123',
        title: 'Knowledge Operations Lead',
        bio: 'Owns the shared document base and validates source updates.',
      },
      {
        id: 'user-member',
        fullName: 'Mila Member',
        email: 'member@docchat.dev',
        memberId: 'MEM-MILAME-0001',
        role: 'member',
        password: 'Member@123',
        title: 'Support Specialist',
        bio: 'Uses the group document knowledge base to answer customer questions.',
      },
    ],
    groups: [
      {
        id: 'grp-ops',
        name: 'Operations',
        description: 'Daily SOPs and support handling guidance.',
      },
      {
        id: 'grp-policy',
        name: 'Policy Review',
        description: 'Compliance and policy interpretation workspace.',
      },
    ],
    memberships: [
      { userId: 'user-admin', groupId: 'grp-ops', role: 'admin' },
      { userId: 'user-member', groupId: 'grp-ops', role: 'member' },
      { userId: 'user-admin', groupId: 'grp-policy', role: 'admin' },
      { userId: 'user-member', groupId: 'grp-policy', role: 'member' },
    ],
    documents: {
      'grp-ops': [
        {
          id: 'doc-ops',
          title: 'Support Escalation Handbook',
          summary:
            'Covers severity tiers, required response times, and the escalation ladder for blocked incidents.',
          fileName: 'support-handbook.md',
          content:
            'Severity 1 incidents require an acknowledgement within 15 minutes and escalation to the incident commander immediately. Severity 2 incidents require acknowledgement within 30 minutes and team lead notification. Billing issues are routed to the finance queue within one business day. Product bugs should include reproduction steps, customer impact, and account id.',
          description: 'Operations support runbook uploaded by the workspace admin.',
          updatedAt: '2026-03-20T10:30:00.000Z',
          indexedAt: '2026-03-20T10:31:00.000Z',
          uploadedBy: 'Avery Admin',
          embeddingModel: 'models/gemini-embedding-001',
          vectorStoreBackend: 'chroma',
          chunkCount: 4,
          indexingStatus: 'indexed',
          indexingError: '',
        },
      ],
      'grp-policy': [],
    },
    messages: {
      'grp-ops': [
        {
          id: 'seed-message-1',
          role: 'assistant',
          content:
            'The Operations group is connected to the Support Escalation Handbook. Ask about SLAs, routing, or escalation paths.',
          createdAt: '2026-03-20T10:45:00.000Z',
        },
      ],
      'grp-policy': [],
    },
  }
}

function readDemoDb() {
  try {
    const stored = window.localStorage.getItem(DEMO_STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch {
    window.localStorage.removeItem(DEMO_STORAGE_KEY)
  }

  const seeded = createSeededDemoDb()
  window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(seeded))
  return seeded
}

function writeDemoDb(db) {
  window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(db))
}

function createSession(user) {
  return {
    token: `demo-token-${user.id}`,
    refresh: `demo-refresh-${user.id}`,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      memberId: user.memberId ?? '',
      role: user.role,
      companyName: user.companyName ?? '',
    },
  }
}

function readStoredSession() {
  try {
    const stored = window.localStorage.getItem(SESSION_STORAGE_KEY)
    return stored ? JSON.parse(stored) : null
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
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

function getUserIdFromToken(token) {
  return token?.replace('demo-token-', '') ?? ''
}

function getDemoUserByToken(token) {
  const db = readDemoDb()
  const userId = getUserIdFromToken(token)
  const user = db.users.find((entry) => entry.id === userId)

  if (!user) {
    throw new Error('Demo session expired. Login again.')
  }

  return { db, user }
}

function normalizeDocuments(value) {
  if (Array.isArray(value)) return value
  if (value) return [value]
  return []
}

function buildWorkspace(db, user) {
  const profile = {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    memberId: user.memberId ?? '',
    role: user.role,
    companyName: user.companyName ?? '',
    title: user.title,
    bio: user.bio,
  }

  const groups = db.memberships
    .filter((membership) => membership.userId === user.id)
    .map((membership) => {
      const group = db.groups.find((entry) => entry.id === membership.groupId)
      const documents = normalizeDocuments(db.documents[membership.groupId])
      const latestDocument = documents[0] ?? null

      return {
        id: group.id,
        name: group.name,
        description: group.description,
        role: membership.role,
        hasDocument: documents.length > 0,
        documentCount: documents.length,
        documentTitle: latestDocument?.title ?? '',
        documentStatus: latestDocument?.indexingStatus ?? 'pending',
        updatedAt: latestDocument?.updatedAt ?? null,
      }
    })

  return { profile, groups }
}

function requireGroupMembership(db, userId, groupId) {
  const membership = db.memberships.find(
    (entry) => entry.userId === userId && entry.groupId === groupId,
  )

  if (!membership) {
    throw new Error('You do not have access to this group.')
  }

  const group = db.groups.find((entry) => entry.id === groupId)
  return { group, membership }
}

function chunkContent(content) {
  return content
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean)
}

function generateDocumentAnswer(message, documents) {
  const prompt = message.toLowerCase()
  const sourceDocuments = normalizeDocuments(documents)
  const searchableChunks = sourceDocuments.flatMap((document) =>
    chunkContent(document.content).map((chunk) => ({ chunk, document })),
  )
  const relevantChunk =
    searchableChunks.find(({ chunk }) =>
      prompt.split(/\s+/).some((term) => term.length > 3 && chunk.toLowerCase().includes(term)),
    ) ?? searchableChunks[0]

  return `According to "${relevantChunk.document.title}", ${relevantChunk.chunk}.`
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options)
  const contentType = response.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json') ? await response.json() : null

  if (response.status === 401 && options.retry !== false) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      const headers = new Headers(options.headers ?? {})
      headers.set('Authorization', `Bearer ${refreshed.token}`)
      return request(path, { ...options, headers, retry: false })
    }
  }

  if (!response.ok) {
    let message = payload?.detail ?? payload?.message

    // Handle structured validation errors (e.g., { password: ["too short", "too common"] })
    if (!message && payload && typeof payload === 'object') {
      const issues = Object.entries(payload).map(([field, errors]) => {
        const label = field === 'non_field_errors' ? '' : `${field}: `
        const errorText = Array.isArray(errors) ? errors.join(' ') : String(errors)
        return `${label}${errorText}`
      })
      if (issues.length > 0) {
        message = issues.join(' | ')
      }
    }

    throw new Error(message ?? `Request failed with status ${response.status}.`)
  }

  return payload
}

function mapAuthResponse(payload) {
  const token = payload.token ?? payload.access ?? payload.authToken
  const refresh = payload.refresh ?? ''
  const user = payload.user ?? payload.profile

  if (!token || !user) {
    throw new Error('Backend auth response must include a token and user object.')
  }

  return {
    token,
    refresh,
    user: {
      id: user.id,
      fullName: user.full_name ?? user.fullName ?? '',
      email: user.email ?? '',
      memberId: user.member_id ?? user.memberId ?? '',
      role: user.role ?? 'member',
      companyName: user.company_name ?? user.companyName ?? '',
    },
  }
}

function mapProfile(profile) {
  return {
    id: profile.id,
    fullName: profile.full_name ?? profile.fullName ?? '',
    email: profile.email ?? '',
    memberId: profile.member_id ?? profile.memberId ?? '',
    role: profile.role ?? 'member',
    companyName: profile.company_name ?? profile.companyName ?? '',
    title: profile.title ?? '',
    bio: profile.bio ?? '',
  }
}

function mapAdminMember(member) {
  return {
    id: member.id,
    fullName: member.full_name ?? member.fullName ?? '',
    email: member.email ?? '',
    memberId: member.member_id ?? member.memberId ?? '',
    role: member.role ?? 'member',
    title: member.title ?? '',
    bio: member.bio ?? '',
    groups: member.groups ?? [],
  }
}

function mapGroup(group) {
  const documents = (group.documents ?? (group.document ? [group.document] : [])).map(mapDocument)
  const latestDocument = documents[0] ?? null
  return {
    id: group.id,
    name: group.name,
    description: group.description ?? '',
    role: group.role,
    hasDocument: documents.length > 0,
    documentCount: documents.length,
    documentTitle: latestDocument?.title ?? '',
    documentStatus: latestDocument?.indexingStatus ?? 'pending',
    updatedAt: latestDocument?.updatedAt ?? null,
  }
}

function mapMessage(message) {
  return {
    id: message.id ?? `message-${crypto.randomUUID()}`,
    role: message.role,
    content: message.content,
    createdAt: message.created_at ?? message.createdAt ?? new Date().toISOString(),
  }
}

function mapDocument(document) {
  if (!document) return null

  return {
    id: document.id,
    title: document.title,
    description: document.description ?? '',
    summary: document.summary ?? '',
    fileName: document.file_name ?? document.fileName ?? 'uploaded-document',
    updatedAt: document.updated_at ?? document.updatedAt ?? new Date().toISOString(),
    indexedAt: document.indexed_at ?? document.indexedAt ?? null,
    uploadedBy: document.uploaded_by ?? document.uploadedBy ?? 'Unknown',
    embeddingModel: document.embedding_model ?? document.embeddingModel ?? '',
    vectorStoreBackend: document.vector_store_backend ?? document.vectorStoreBackend ?? '',
    chunkCount: document.chunk_count ?? document.chunkCount ?? 0,
    indexingStatus: document.indexing_status ?? document.indexingStatus ?? 'pending',
    indexingError: document.indexing_error ?? document.indexingError ?? '',
  }
}

async function refreshAccessToken() {
  const session = readStoredSession()
  if (!session?.refresh) return null

  const response = await fetch(`${API_BASE_URL}/api/auth/refresh/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh: session.refresh }),
  })

  if (!response.ok) {
    writeStoredSession(null)
    return null
  }

  const payload = await response.json()
  const nextSession = {
    ...session,
    token: payload.access,
    refresh: payload.refresh ?? session.refresh,
  }
  writeStoredSession(nextSession)
  return nextSession
}

const demoApi = {
  async signup(data) {
    const db = readDemoDb()
    const existingUser = db.users.find(
      (entry) => entry.email.toLowerCase() === data.email.toLowerCase(),
    )

    if (existingUser) {
      throw new Error('An account with this email already exists.')
    }

    const groupId = `grp-${Date.now()}`
    const user = {
      id: `user-${Date.now()}`,
      fullName: data.fullName,
      email: data.email,
      memberId: null,
      role: 'admin',
      companyName: data.companyName,
      password: data.password,
      title: 'Workspace Admin',
      bio: `Admin account for ${data.companyName}.`,
    }

    db.users.push(user)
    db.groups.push({
      id: groupId,
      name: `${data.companyName} Workspace`,
      description: `Primary document workspace for ${data.companyName}.`,
    })
    db.memberships.push({ userId: user.id, groupId, role: 'admin' })
    db.messages[groupId] = []
    db.documents[groupId] = []
    writeDemoDb(db)

    return createSession(user)
  },

  async login(credentials) {
    const db = readDemoDb()
    const user = db.users.find(
      (entry) =>
        [entry.email.toLowerCase(), entry.memberId?.toLowerCase()].includes(
          credentials.identifier.toLowerCase(),
        ) &&
        entry.password === credentials.password,
    )

    if (!user) {
      throw new Error('Invalid demo credentials.')
    }

    return createSession(user)
  },

  async fetchWorkspace(token) {
    const { db, user } = getDemoUserByToken(token)
    return buildWorkspace(db, user)
  },

  async fetchMembers(token) {
    const { db, user } = getDemoUserByToken(token)
    if (user.role !== 'admin') {
      throw new Error('Only admins can view members.')
    }

    const adminGroupIds = db.memberships
      .filter((entry) => entry.userId === user.id && entry.role === 'admin')
      .map((entry) => entry.groupId)

    return db.users
      .filter(
        (entry) =>
          entry.role === 'member' &&
          db.memberships.some(
            (membership) =>
              membership.userId === entry.id && adminGroupIds.includes(membership.groupId),
          ),
      )
      .map((entry) => ({
        id: entry.id,
        fullName: entry.fullName,
        email: entry.email,
        memberId: entry.memberId ?? '',
        role: entry.role,
        title: entry.title ?? '',
        bio: entry.bio ?? '',
        groups: db.memberships
          .filter(
            (membership) =>
              membership.userId === entry.id && adminGroupIds.includes(membership.groupId),
          )
          .map((membership) => {
            const group = db.groups.find((candidate) => candidate.id === membership.groupId)
            return { id: group.id, name: group.name }
          }),
      }))
  },

  async fetchGroupContext(token, groupId) {
    const { db, user } = getDemoUserByToken(token)
    requireGroupMembership(db, user.id, groupId)

    return {
      documents: normalizeDocuments(db.documents[groupId]).map((document) => ({ ...document })),
      messages: (db.messages[groupId] ?? []).map((message) => ({ ...message })),
    }
  },

  async updateProfile(token, payload) {
    const { db, user } = getDemoUserByToken(token)
    const targetUser = db.users.find((entry) => entry.id === user.id)

    targetUser.fullName = payload.fullName
    targetUser.title = payload.title
    targetUser.bio = payload.bio
    writeDemoDb(db)

    return {
      id: targetUser.id,
      fullName: targetUser.fullName,
      email: targetUser.email,
      memberId: targetUser.memberId ?? '',
      role: targetUser.role,
      title: targetUser.title,
      bio: targetUser.bio,
    }
  },

  async createMember(token, payload) {
    const { db, user } = getDemoUserByToken(token)
    if (user.role !== 'admin') {
      throw new Error('Only admins can create members.')
    }

    const groupIds = payload.groupIds ?? []
    const allowedGroups = db.memberships
      .filter((entry) => entry.userId === user.id && entry.role === 'admin')
      .map((entry) => entry.groupId)

    if (!groupIds.length || !groupIds.every((groupId) => allowedGroups.includes(groupId))) {
      throw new Error('Choose only groups you administer.')
    }

    const existingUser = db.users.find(
      (entry) => entry.email.toLowerCase() === payload.email.toLowerCase(),
    )
    if (existingUser) {
      throw new Error('An account with this email already exists.')
    }

    const memberId = `MEM-${payload.fullName.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase() || 'MEMBER'}-${String(db.users.length + 1).padStart(4, '0')}`
    const newUser = {
      id: `user-${Date.now()}`,
      fullName: payload.fullName,
      email: payload.email,
      memberId,
      role: 'member',
      password: payload.password,
      title: payload.title || 'Member',
      bio: payload.bio || '',
    }

    db.users.push(newUser)
    groupIds.forEach((groupId) => {
      db.memberships.push({ userId: newUser.id, groupId, role: 'member' })
    })
    writeDemoDb(db)

    return {
      id: newUser.id,
      fullName: newUser.fullName,
      email: newUser.email,
      memberId: newUser.memberId,
      role: newUser.role,
      title: newUser.title,
      bio: newUser.bio,
    }
  },

  async uploadDocument(token, groupId, payload) {
    const { db, user } = getDemoUserByToken(token)
    const { membership } = requireGroupMembership(db, user.id, groupId)

    if (membership.role !== 'admin') {
      throw new Error('Only group admins can upload documents.')
    }

    const files = payload.files?.length ? payload.files : [payload.file].filter(Boolean)
    const uploadedDocuments = await Promise.all(
      files.map(async (file, index) => {
        const text = await file.text()
        const content = text.trim() || `${payload.title || file.name} uploaded without preview text.`
        return {
          id: `doc-${Date.now()}-${index}`,
          title: files.length === 1 && payload.title ? payload.title : file.name.replace(/\.[^.]+$/, ''),
          description: payload.description || '',
          summary:
            payload.description ||
            content.slice(0, 180) + (content.length > 180 ? '...' : ''),
          fileName: file.name,
          content,
          updatedAt: new Date().toISOString(),
          indexedAt: new Date().toISOString(),
          uploadedBy: user.fullName,
          embeddingModel: 'models/gemini-embedding-001',
          vectorStoreBackend: 'chroma',
          chunkCount: Math.max(1, Math.ceil(content.length / 240)),
          indexingStatus: 'indexed',
          indexingError: '',
        }
      }),
    )

    db.documents[groupId] = [...uploadedDocuments, ...normalizeDocuments(db.documents[groupId])]
    if (!db.messages[groupId]?.length) {
      db.messages[groupId] = [
        {
          id: `message-${Date.now()}`,
          role: 'assistant',
          content: `${uploadedDocuments.length} group document${uploadedDocuments.length === 1 ? '' : 's'} now available. Ask questions that stay within this source.`,
          createdAt: new Date().toISOString(),
        },
      ]
    }
    writeDemoDb(db)

    return {
      document: uploadedDocuments[0],
      uploadedDocuments,
      documents: normalizeDocuments(db.documents[groupId]).map((entry) => ({ ...entry })),
      uploadErrors: [],
      messages: db.messages[groupId].map((message) => ({ ...message })),
    }
  },

  async sendMessage(token, groupId, message) {
    const { db, user } = getDemoUserByToken(token)
    requireGroupMembership(db, user.id, groupId)

    const documents = normalizeDocuments(db.documents[groupId])
    if (!documents.length) {
      throw new Error('A group admin must upload a document before chat is available.')
    }

    const reply = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: generateDocumentAnswer(message, documents),
      createdAt: new Date().toISOString(),
    }

    db.messages[groupId] = [
      ...(db.messages[groupId] ?? []),
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content: message,
        createdAt: new Date().toISOString(),
      },
      reply,
    ]
    writeDemoDb(db)

    return {
      message: reply,
      documents: documents.map((document) => ({ ...document })),
    }
  },
}

const backendApi = {
  async login(credentials) {
    const payload = await request('/api/auth/login/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identifier: credentials.identifier,
        password: credentials.password,
      }),
    })

    return mapAuthResponse(payload)
  },

  async signup(data) {
    const payload = await request('/api/auth/signup/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        full_name: data.fullName,
        company_name: data.companyName,
        email: data.email,
        password: data.password,
      }),
    })

    return mapAuthResponse(payload)
  },

  async logout(token, refresh) {
    if (!refresh) return

    await request('/api/auth/logout/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh }),
      retry: false,
    })
  },

  async fetchWorkspace(token) {
    const [profile, groups] = await Promise.all([
      request('/api/profile/', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      request('/api/groups/', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
    ])

    return {
      profile: mapProfile(profile),
      groups: groups.map(mapGroup),
    }
  },

  async fetchMembers(token) {
    const payload = await request('/api/members/', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    return payload.map(mapAdminMember)
  },

  async fetchGroupContext(token, groupId) {
    const payload = await request(`/api/groups/${groupId}/`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    return {
      documents: (payload.documents ?? (payload.document ? [payload.document] : [])).map(mapDocument),
      messages: (payload.messages ?? []).map(mapMessage),
    }
  },

  async updateProfile(token, data) {
    const payload = await request('/api/profile/', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        full_name: data.fullName,
        title: data.title,
        bio: data.bio,
      }),
    })

    return mapProfile(payload)
  },

  async createMember(token, data) {
    const payload = await request('/api/members/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        full_name: data.fullName,
        email: data.email,
        password: data.password,
        title: data.title,
        bio: data.bio,
        group_ids: data.groupIds,
      }),
    })

    return mapProfile(payload)
  },

  async uploadDocument(token, groupId, payload) {
    const formData = new FormData()
    formData.append('title', payload.title)
    formData.append('description', payload.description)
    payload.files.forEach((file) => {
      formData.append('files', file)
    })

    const response = await request(`/api/groups/${groupId}/documents/upload/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    })

    return {
      document: mapDocument(response.document),
      uploadedDocuments: (response.uploaded_documents ?? []).map(mapDocument),
      documents: (response.documents ?? (response.document ? [response.document] : [])).map(mapDocument),
      uploadErrors: response.upload_errors ?? [],
      messages: (response.messages ?? []).map(mapMessage),
    }
  },

  async sendMessage(token, groupId, message) {
    const payload = await request(`/api/groups/${groupId}/chat/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        scope: 'document',
      }),
    })

    return {
      message: mapMessage(payload.message ?? payload),
      documents: (payload.documents ?? (payload.document ? [payload.document] : [])).map(mapDocument),
    }
  },
}

export const api = API_MODE === 'backend' ? backendApi : demoApi
