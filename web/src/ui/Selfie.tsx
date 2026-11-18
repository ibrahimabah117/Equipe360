import { useEffect, useRef, useState } from 'react'
import { Camera, RotateCcw, UserRound } from 'lucide-react'
import { shrinkToJpeg } from '../lib/photos'
import { DEMO } from '../lib/supabase'
import { Button, cx } from './index'

/** Faux visage pour la démo (aucune caméra sollicitée) */
function demoFace(): string {
  const c = document.createElement('canvas')
  c.width = 240
  c.height = 320
  const g = c.getContext('2d')!
  g.fillStyle = '#334155'
  g.fillRect(0, 0, 240, 320)
  g.fillStyle = '#a16207'
  g.beginPath()
  g.arc(120, 130, 60, 0, Math.PI * 2)
  g.fill()
  g.fillRect(50, 210, 140, 110)
  return c.toDataURL('image/jpeg', 0.7)
}

/**
 * Prise d'un selfie avec la caméra avant, directement dans la page
 * (pas de choix dans la galerie). Repli : appareil photo du téléphone.
 */
export function Selfie({ value, onChange }: { value: string | null; onChange: (dataUrl: string | null) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [live, setLive] = useState(false)
  const [starting, setStarting] = useState(false)
  const [fallback, setFallback] = useState(false)

  function stop() {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    setLive(false)
  }
  useEffect(() => stop, [])

  async function start() {
    if (DEMO) return onChange(demoFace())
    setStarting(true)
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false })
      stream.current = s
      setLive(true)
      requestAnimationFrame(() => {
        if (video.current) {
          video.current.srcObject = s
          video.current.play().catch(() => {})
        }
      })
    } catch {
      setFallback(true)
      fileInput.current?.click()
    } finally {
      setStarting(false)
    }
  }

  function capture() {
    const v = video.current
    if (!v || !v.videoWidth) return
    onChange(shrinkToJpeg(v, v.videoWidth, v.videoHeight, 360, true))
    stop()
  }

  function fromFile(file: File | undefined) {
    if (!file) return
    const img = new Image()
    img.onload = () => {
      onChange(shrinkToJpeg(img, img.naturalWidth, img.naturalHeight))
      URL.revokeObjectURL(img.src)
    }
    img.src = URL.createObjectURL(file)
  }

  return (
    <div>
      <input ref={fileInput} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => fromFile(e.target.files?.[0])} />
      {value ? (
        <div className="flex items-center gap-4">
          <img src={value} alt="Selfie" className="size-20 rounded-2xl object-cover ring-1 ring-ink-200" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-emerald-700">Selfie prêt</p>
            <button type="button" onClick={() => { onChange(null); start() }} className="mt-1 inline-flex items-center gap-1 text-brand-600 hover:underline">
              <RotateCcw className="size-3.5" /> Reprendre
            </button>
          </div>
        </div>
      ) : live ? (
        <div className="space-y-3">
          <div className="relative mx-auto aspect-[3/4] w-48 overflow-hidden rounded-2xl bg-black">
            <video ref={video} className="size-full -scale-x-100 object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-x-6 top-6 bottom-10 rounded-[50%] ring-2 ring-white/70" />
          </div>
          <Button type="button" className="w-full" icon={Camera} onClick={capture}>Prendre la photo</Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => (fallback ? fileInput.current?.click() : start())}
          disabled={starting}
          className={cx('flex w-full items-center gap-4 rounded-2xl border-2 border-dashed border-ink-200 p-4 text-left hover:border-brand-300', starting && 'opacity-60')}
        >
          <span className="flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <UserRound className="size-6" />
          </span>
          <span className="flex-1">
            <span className="block font-medium">Prendre mon selfie</span>
            <span className="block text-xs text-ink-500">Visage bien visible, face à la caméra</span>
          </span>
          <Camera className="size-5 text-ink-400" />
        </button>
      )}
    </div>
  )
}
