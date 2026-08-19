export function getAvatarInitial(firstName, username) {
  const name = typeof firstName === 'string' ? firstName.trim() : ''
  const handle = typeof username === 'string' ? username.trim() : ''
  return Array.from(name || handle || 'W')[0].toUpperCase()
}
