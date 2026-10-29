const prefix = 'aurelia_checkout_intent_v3:'
export const intentStorageKey = userId => `${prefix}${userId}`
export function readIntent(userId) {
  try { return JSON.parse(localStorage.getItem(intentStorageKey(userId)) || 'null') } catch { return null }
}
export function saveIntent(userId, intent) { localStorage.setItem(intentStorageKey(userId), JSON.stringify(intent)); return intent }
export async function checkoutIntent(userId, input) {
  // Deterministic UUID per customer + immutable checkout snapshot + explicit
  // purchase generation. Concurrent tabs generate the SAME key even without locks.
  const key = intentStorageKey(userId), prior = readIntent(userId)
  const normalized = { ...input, items: [...input.items].sort((a,b) => a.variantId.localeCompare(b.variantId)) }
  const fingerprint = JSON.stringify(normalized)
  if (prior?.submitted && prior.fingerprint !== fingerprint) throw new Error('Check your existing checkout before starting a new purchase.')
  if (prior?.fingerprint === fingerprint) return prior
  const generation = localStorage.getItem(`${key}:generation`) || '0'
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${userId}:${generation}:${fingerprint}`)))
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128
  const hex = [...bytes.slice(0,16)].map(b => b.toString(16).padStart(2,'0')).join('')
  const idempotencyKey = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
  return saveIntent(userId, { idempotencyKey, fingerprint, input: normalized, submitted: false })
}
export function newPurchase(userId) {
  localStorage.setItem(`${intentStorageKey(userId)}:generation`, crypto.randomUUID())
  localStorage.removeItem(intentStorageKey(userId))
}
