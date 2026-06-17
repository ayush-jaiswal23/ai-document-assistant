import { SESSION_STORAGE_KEY } from '../api'

export function readStoredSession() {
  try {
    const stored = window.localStorage.getItem(SESSION_STORAGE_KEY)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

export function writeStoredSession(session) {
  if (!session) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}
