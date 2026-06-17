import { PasswordField } from '../common/PasswordField'

export function ProfileLayout({
  profileForm,
  updateProfileForm,
  onProfileSave,
  pending,
  isAdminUser,
  memberForm,
  updateMemberForm,
  onMemberCreate,
  visiblePasswords,
  togglePassword,
  manageableGroups,
  toggleMemberGroup,
  adminMembers,
  pendingMemberList,
}) {
  return (
    <section className="profile-layout">
      <div className="section-heading">
        <p>Profile settings</p>
        <h2>Keep your identity current for group collaboration</h2>
      </div>
      <form className="panel profile-panel" onSubmit={onProfileSave}>
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
        <form className="panel profile-panel" onSubmit={onMemberCreate}>
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
          {pendingMemberList ? (
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
  )
}
