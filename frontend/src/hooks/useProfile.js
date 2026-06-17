import { useState, useEffect } from 'react'
import { api } from '../api'

export function useProfile(session, workspace, setWorkspace, setNotice, setAdminMembers) {
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    title: '',
    bio: '',
    email: '',
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
    memberPassword: false,
    memberConfirmPassword: false,
  })
  const [pending, setPending] = useState({
    profile: false,
    member: false,
  })

  useEffect(() => {
    if (workspace.profile) {
      setProfileForm({
        fullName: workspace.profile.fullName ?? '',
        title: workspace.profile.title ?? '',
        bio: workspace.profile.bio ?? '',
        email: workspace.profile.email ?? '',
      })
    }
  }, [workspace.profile])

  const updateProfileForm = (field, value) => {
    setProfileForm((current) => ({ ...current, [field]: value }))
  }

  const updateMemberForm = (field, value) => {
    setMemberForm((current) => ({ ...current, [field]: value }))
  }

  const togglePassword = (field) => {
    setVisiblePasswords((current) => ({ ...current, [field]: !current[field] }))
  }

  const toggleMemberGroup = (groupId) => {
    setMemberForm((current) => ({
      ...current,
      groupIds: current.groupIds.includes(groupId)
        ? current.groupIds.filter((entry) => entry !== groupId)
        : [...current.groupIds, groupId],
    }))
  }

  const handleProfileSave = async (event) => {
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

  const handleMemberCreate = async (event) => {
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

  return {
    profileForm,
    updateProfileForm,
    handleProfileSave,
    memberForm,
    updateMemberForm,
    handleMemberCreate,
    visiblePasswords,
    togglePassword,
    toggleMemberGroup,
    pending,
  }
}
