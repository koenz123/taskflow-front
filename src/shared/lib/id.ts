export function createId(prefix = 'id') {
  // Good enough for client-side mock data / localStorage.
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

