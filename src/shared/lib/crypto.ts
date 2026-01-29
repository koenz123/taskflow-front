export async function sha256Base64(input: string) {
  const enc = new TextEncoder()
  const data = enc.encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(hash)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

