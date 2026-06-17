import { PasswordField } from '../common/PasswordField'

export function AuthLayout({
  authMode,
  authForm,
  onAuthSubmit,
  updateAuthForm,
  visiblePasswords,
  togglePassword,
  pending,
  onNavigate,
}) {
  return (
    <section className="auth-layout">
      <div className="section-heading">
        <p>{authMode === 'signup' ? 'Start a trial workspace' : 'Secure access'}</p>
        <h2>
          {authMode === 'signup'
            ? 'Create an admin account for your company'
            : 'Login with your email or member ID'}
        </h2>
      </div>
      <form className="panel auth-panel" onSubmit={onAuthSubmit}>
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
        <button className="primary-button" disabled={pending} type="submit">
          {pending
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
          onClick={() => onNavigate(authMode === 'signup' ? 'login' : 'signup')}
          type="button"
        >
          {authMode === 'signup' ? 'Back to login' : 'Create admin account'}
        </button>
      </div>
    </section>
  )
}
