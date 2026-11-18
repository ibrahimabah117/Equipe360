import { DEMO, supabase } from './supabase'

const BUCKET = 'punch-photos'
const DEVICE_KEY = 'e360.deviceId'

/** Identifiant aléatoire de ce téléphone (sert à repérer un téléphone utilisé par plusieurs agents) */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return 'inconnu'
  }
}

export function photoPath(companyId: string, clientId: string) {
  return `${companyId}/${clientId}.jpg`
}

/**
 * Réduit une image (vidéo de la caméra ou photo choisie) en petit JPEG :
 * ~20 Ko, assez pour reconnaître un visage, léger pour un réseau faible
 * et pour être gardé sur le téléphone en attendant le réseau.
 */
export function shrinkToJpeg(source: CanvasImageSource, width: number, height: number, max = 360, mirror = false): string {
  const scale = Math.min(1, max / Math.max(width, height))
  const w = Math.round(width * scale)
  const h = Math.round(height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  if (mirror) {
    ctx.translate(w, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(source, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.7)
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',')
  const mime = head.match(/data:(.*?);/)?.[1] ?? 'image/jpeg'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/* Démo : les photos restent en mémoire */
const demoPhotos = new Map<string, string>()

/**
 * Envoie le selfie. « exists » : déjà envoyé lors d'un essai précédent (ce n'est pas une erreur).
 */
export async function uploadPunchPhoto(path: string, dataUrl: string): Promise<{ error: { message: string } | null; status?: number }> {
  if (DEMO) {
    demoPhotos.set(path, dataUrl)
    return { error: null }
  }
  const { error } = await supabase.storage.from(BUCKET).upload(path, dataUrlToBlob(dataUrl), { contentType: 'image/jpeg', upsert: false })
  if (!error) return { error: null }
  const e = error as { message: string; statusCode?: string; status?: number }
  if (/exist|duplicate/i.test(e.message) || e.statusCode === '409') return { error: null }
  return { error: { message: e.message }, status: e.status ?? (Number(e.statusCode) || undefined) }
}

/** Adresse temporaire (1 h) pour afficher un selfie à un responsable */
export async function punchPhotoUrl(path: string): Promise<string | null> {
  if (DEMO) return demoPhotos.get(path) ?? null
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}
