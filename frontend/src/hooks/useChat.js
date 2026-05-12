import { useState, useCallback, useRef, useEffect } from 'react'
import { api } from '../api'

export function useChat(session, selectedGroup, setNotice, setWorkspace) {
  const [chatState, setChatState] = useState({})
  const [draftMessage, setDraftMessage] = useState('')
  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    files: [],
  })
  const [pending, setPending] = useState({
    chat: false,
    upload: false,
  })

  // We use a ref to track the latest chatState so ensureGroupContext can be stable
  // without depending on chatState, which prevents infinite loops in parent effects.
  const chatStateRef = useRef(chatState)
  useEffect(() => {
    chatStateRef.current = chatState
  }, [chatState])

  const ensureGroupContext = useCallback(async (token, groupId) => {
    if (chatStateRef.current[groupId]?.loaded) return

    const context = await api.fetchGroupContext(token, groupId)
    setChatState((current) => ({
      ...current,
      [groupId]: {
        loaded: true,
        messages: context.messages,
        documents: context.documents,
      },
    }))
  }, [])

  const handleSendMessage = async (event) => {
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

  const handleDocumentUpload = async (event) => {
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

  return {
    chatState,
    setChatState,
    draftMessage,
    setDraftMessage,
    uploadForm,
    setUploadForm,
    pending,
    ensureGroupContext,
    handleSendMessage,
    handleDocumentUpload,
  }
}
