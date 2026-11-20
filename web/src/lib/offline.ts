import type { PunchKind } from './punchKinds'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { photoPath, uploadPunchPhoto } from './photos'

/* ------------------------------------------------------------------ Cache local */

const PREFIX = 'e360.'

export function cacheSet(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + 'cache.' + key, JSON.stringify(value))
  } catch {
    /* stockage plein ou indisponible */
  }
}

export function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + 'cache.' + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

/** Vrai quand l'erreur vient du réseau (pas de connexion), pas du serveur */
export function isNetworkError(error: { message?: string; code?: string } | null | undefined, status?: number) {
  if (!error) return false
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  if (status === 0) return true
  return /failed to fetch|network|load failed|fetch failed|timeout|abort/i.test(error.message ?? '')
}

/* ------------------------------------------------------------------ File d'attente des pointages */

export interface QueuedPunch {
  client_id: string
  qr_token: string
  kind: PunchKind
  punched_at: string
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  employee_id: string | null
  employee_name: string | null
  site_name: string | null
  /** Entreprise du site : sert au chemin du selfie */
  company_id?: string | null
  device_id?: string | null
  /** Selfie en petit JPEG (data URL), gardé ici tant qu'il n'est pas envoyé */
  photo?: string | null
  photo_uploaded?: boolean
  error?: string
}

export interface PunchResult {
  punch_id: string
  site_name: string
  distance_m: number | null
  gps_ok: boolean
  flags?: string[]
}

const QUEUE_KEY = PREFIX + 'punchQueue'
const FAILED_KEY = PREFIX + 'punchFailed'

function read(key: string): QueuedPunch[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]') as QueuedPunch[]
  } catch {
    return []
  }
}
function write(key: string, list: QueuedPunch[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    // Stockage plein : on sacrifie les selfies plutôt que les pointages
    try {
      localStorage.setItem(key, JSON.stringify(list.map((p) => (p.photo_uploaded ? p : { ...p, photo: null }))))
    } catch {
      /* stockage indisponible */
    }
  }
  emit()
}

const listeners = new Set<() => void>()
let snapshot = { queue: read(QUEUE_KEY), failed: read(FAILED_KEY), syncing: false }
function emit() {
  snapshot = { queue: read(QUEUE_KEY), failed: read(FAILED_KEY), syncing }
  listeners.forEach((l) => l())
}
let syncing = false

async function send(p: QueuedPunch): Promise<{ data: unknown; error: { message: string } | null; status?: number }> {
  // 1. le selfie d'abord : le serveur vérifie qu'il est bien arrivé
  let path: string | null = null
  if (p.photo && p.company_id) {
    path = photoPath(p.company_id, p.client_id)
    if (!p.photo_uploaded) {
      const up = await uploadPunchPhoto(path, p.photo)
      if (up.error && isNetworkError(up.error, up.status)) return { data: null, error: up.error, status: 0 }
      if (up.error) path = null // refusé : le pointage part sans photo (et sera signalé)
      else p.photo_uploaded = true
    }
  }
  // 2. le pointage
  return supabase.rpc('punch', {
    p_qr_token: p.qr_token,
    p_kind: p.kind,
    p_client_id: p.client_id,
    p_punched_at: p.punched_at,
    p_latitude: p.latitude,
    p_longitude: p.longitude,
    p_employee_id: p.employee_id,
    p_accuracy: p.accuracy == null ? null : Math.round(p.accuracy),
    p_device_id: p.device_id ?? null,
    p_photo_path: path,
  })
}

/**
 * Envoie le pointage tout de suite. Sans réseau, il est gardé sur le téléphone
 * et renvoyé automatiquement (le serveur ignore les doublons grâce à client_id).
 */
export async function submitPunch(p: QueuedPunch): Promise<{ status: 'sent'; result: PunchResult } | { status: 'queued' } | { status: 'error'; message: string }> {
  const { data, error, status } = await send(p)
  if (!error) {
    const result = (Array.isArray(data) ? data[0] : data) as PunchResult
    rememberLast(p)
    return { status: 'sent', result }
  }
  if (isNetworkError(error, status)) {
    write(QUEUE_KEY, [...read(QUEUE_KEY), p])
    rememberLast(p)
    return { status: 'queued' }
  }
  return { status: 'error', message: error.message }
}

export async function syncQueue() {
  if (syncing) return
  const queue = read(QUEUE_KEY)
  if (!queue.length) return
  syncing = true
  emit()
  try {
    for (const p of queue) {
      const { error, status } = await send(p)
      if (error && isNetworkError(error, status)) break // toujours pas de réseau : on réessaiera
      write(QUEUE_KEY, read(QUEUE_KEY).filter((x) => x.client_id !== p.client_id))
      if (error) write(FAILED_KEY, [...read(FAILED_KEY), { ...p, photo: null, error: error.message }])
    }
  } finally {
    syncing = false
    emit()
  }
}

export function clearFailed() {
  write(FAILED_KEY, [])
}

/** État de la file (nombre en attente, échecs) pour l'affichage */
export function usePunchQueue() {
  const state = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => snapshot,
  )
  return state
}

/** À monter une fois : renvoie les pointages en attente au retour du réseau */
export function useQueueSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    syncQueue()
    const onOnline = () => syncQueue()
    window.addEventListener('online', onOnline)
    const t = setInterval(syncQueue, 30000)
    return () => {
      window.removeEventListener('online', onOnline)
      clearInterval(t)
    }
  }, [enabled])
}

/* ------------------------------------------------------------------ Dernier pointage (pour proposer arrivée ou départ) */

interface LastPunch {
  kind: PunchKind
  at: string
  site_name: string | null
}

function rememberLast(p: QueuedPunch) {
  const k = PREFIX + 'last.' + (p.employee_id ?? 'me')
  try {
    localStorage.setItem(k, JSON.stringify({ kind: p.kind, at: p.punched_at, site_name: p.site_name }))
  } catch {
    /* stockage indisponible */
  }
}

export function getLast(employeeId: string | null): LastPunch | null {
  try {
    const raw = localStorage.getItem(PREFIX + 'last.' + (employeeId ?? 'me'))
    return raw ? (JSON.parse(raw) as LastPunch) : null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ Connexion */

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}
