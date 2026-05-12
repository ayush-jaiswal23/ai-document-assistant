import { useState } from 'react'
import { api } from '../api'
import { writeStoredSession } from '../utils/storage'
import { navigate } from '../utils/navigation'

export function useAuth(initialSession, setSession, setNotice, route) {
  const [authForm, setAuthForm] = useState({
    fullName: '',
    companyName: '',
    email: '',
    identifier: '',
    password: '',
    confirmPassword: '',
  })
  const [visiblePasswords, setVisiblePasswords] = useState({
    authPassword: false,
    authConfirmPassword: false,
  })
  const [pending, setPending] = useState(false)

  const authMode = route === 'signup' ? 'signup' : 'login'

  const updateAuthForm = (field, value) => {
    setAuthForm((current) => ({ ...current, [field]: value }))
  }

  const togglePassword = (field) => {
    setVisiblePasswords((current) => ({ ...current, [field]: !current[field] }))
  }

  const handleAuthSubmit = async (event) => {
    event.preventDefault()
    setPending(true)

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
      setPending(false)
    }
  }

  return {
    authForm,
    authMode,
    visiblePasswords,
    pending,
    updateAuthForm,
    togglePassword,
    handleAuthSubmit,
  }
}
