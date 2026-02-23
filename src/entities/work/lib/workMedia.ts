import type { Work, WorkMediaType } from '@/entities/work/model/work'

function isAbsoluteUrl(input: string) {
  return (
    input.startsWith('http://') ||
    input.startsWith('https://') ||
    input.startsWith('data:') ||
    input.startsWith('blob:')
  )
}

function joinUrl(base: string, path: string) {
  if (isAbsoluteUrl(path)) return path
  const b = base.endsWith('/') ? base.slice(0, -1) : base
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
}

function normalizeMaybeRelativeUrl(raw: string) {
  const s = raw.trim()
  if (!s) return ''
  if (isAbsoluteUrl(s)) return s
  if (s.startsWith('/')) return s
  return `/${s}`
}

function uniq(list: string[]) {
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of list) {
    const s = v.trim()
    if (!s) continue
    if (seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

export function mediaCandidates(raw: string): string[] {
  const primary = normalizeMaybeRelativeUrl(raw)
  if (!primary) return []
  if (isAbsoluteUrl(primary)) return [primary]

  const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'
  const withApi = primary.startsWith(`${API_BASE}/`) ? primary : joinUrl(API_BASE, primary)
  return uniq([primary, withApi])
}

function ext(url: string) {
  const clean = url.split('?')[0]?.split('#')[0] ?? url
  const idx = clean.lastIndexOf('.')
  return idx >= 0 ? clean.slice(idx + 1).toLowerCase() : ''
}

function inferMediaTypeFromUrl(url: string): WorkMediaType | null {
  const u = url.trim()
  if (!u) return null
  if (u.startsWith('data:image/')) return 'photo'
  if (u.startsWith('data:video/')) return 'video'
  const e = ext(u)
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'svg'].includes(e)) return 'photo'
  if (['mp4', 'webm', 'mov', 'm4v', 'ogv', 'ogg'].includes(e)) return 'video'
  return null
}

function isEmbeddableMediaUrl(url: string, type: WorkMediaType) {
  const u = url.trim()
  if (!u) return false
  if (u.startsWith('data:') || u.startsWith('blob:')) return true
  const inferred = inferMediaTypeFromUrl(u)
  if (inferred) return inferred === type
  // Heuristic: treat our own "media" routes as embeddable.
  if (u.startsWith('/videos/') || u.startsWith('/uploads/') || u.startsWith('/api/videos/') || u.startsWith('/api/uploads/')) {
    return true
  }
  return false
}

export function getWorkDisplayMedia(work: Work): { src: string; type: WorkMediaType; candidates: string[] } | null {
  const rawSrc = (work.mediaUrl ?? work.videoUrl ?? '').trim()
  if (!rawSrc) return null

  const candidates = mediaCandidates(rawSrc)
  const src = candidates[0] ?? ''
  const explicit = work.mediaType === 'photo' || work.mediaType === 'video' ? work.mediaType : null
  const inferred = inferMediaTypeFromUrl(src)
  const type: WorkMediaType = explicit ?? inferred ?? (work.videoUrl && !work.mediaUrl ? 'video' : 'photo')
  return { src, type, candidates }
}

export function isWorkEmbeddable(work: Work): boolean {
  const media = getWorkDisplayMedia(work)
  if (!media) return false
  return media.candidates.some((src) => isEmbeddableMediaUrl(src, media.type))
}

