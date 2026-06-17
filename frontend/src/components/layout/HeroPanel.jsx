import { API_BASE_URL, API_MODE } from '../../api'

export function HeroPanel() {
  return (
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
  )
}
