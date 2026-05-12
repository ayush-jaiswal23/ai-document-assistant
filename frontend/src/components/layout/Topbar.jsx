export function Topbar({ isAuthenticated, navItems, route, onNavigate, onLogout, profile }) {
  return (
    <header className="topbar">
      <nav className="topbar-nav" aria-label="Primary">
        {navItems.filter((item) => (isAuthenticated ? item.private : item.public)).map(
          (item) => (
            <button
              key={item.id}
              className={route === item.id ? 'nav-item active' : 'nav-item'}
              onClick={() => onNavigate(item.id)}
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
            <strong>{profile?.fullName}</strong>
            <span>
              {profile?.role === 'admin'
                ? profile?.email
                : profile?.memberId || profile?.email}
            </span>
          </div>
          <button className="ghost-button" onClick={onLogout} type="button">
            Logout
          </button>
        </div>
      ) : null}
    </header>
  )
}
