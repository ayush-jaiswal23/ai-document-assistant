import { useState, useCallback } from 'react'
import { api, API_MODE } from '../api'

export function useWorkspace(session, setNotice, handleLogout) {
  const [workspace, setWorkspace] = useState({ profile: null, groups: [] })
  const [adminMembers, setAdminMembers] = useState([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [pending, setPending] = useState({
    workspace: false,
    memberList: false,
  })

  const loadWorkspace = useCallback(async (activeSession, preferredGroupId = '') => {
    setPending((current) => ({ ...current, workspace: true }))

    try {
      const nextWorkspace = await api.fetchWorkspace(activeSession.token)
      setWorkspace(nextWorkspace)

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
      
      return nextWorkspace
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
      if (API_MODE === 'backend') handleLogout()
    } finally {
      setPending((current) => ({ ...current, workspace: false }))
    }
  }, [setNotice, handleLogout])

  return {
    workspace,
    setWorkspace,
    adminMembers,
    setAdminMembers,
    selectedGroupId,
    setSelectedGroupId,
    pending,
    loadWorkspace,
  }
}
