export function PasswordField({ label, value, onChange, visible, onToggle, placeholder, minLength }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="password-control">
        <input
          minLength={minLength}
          onChange={onChange}
          placeholder={placeholder}
          required
          type={visible ? 'text' : 'password'}
          value={value}
        />
        <button className="password-toggle" onClick={onToggle} type="button">
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </label>
  )
}
