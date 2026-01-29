function readFileAsDataURL(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('file_read_failed'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image_load_failed'))
    img.src = src
  })
}

export async function fileToAvatarDataUrl(file: File, sizePx = 160): Promise<string> {
  const dataUrl = await readFileAsDataURL(file)
  const img = await loadImage(dataUrl)

  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const side = Math.min(w, h)
  const sx = Math.max(0, Math.floor((w - side) / 2))
  const sy = Math.max(0, Math.floor((h - side) / 2))

  const canvas = document.createElement('canvas')
  canvas.width = sizePx
  canvas.height = sizePx
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_not_supported')

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, sx, sy, side, side, 0, 0, sizePx, sizePx)

  // JPEG keeps storage smaller than PNG in most cases.
  return canvas.toDataURL('image/jpeg', 0.86)
}

