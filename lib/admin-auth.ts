// Keep the existing admin login and protected showcase actions on one check.
export function isAdminPassword(value: unknown) {
  return typeof value === 'string' && value === (process.env.ADMIN_PASSWORD || 'Pibbles')
}
