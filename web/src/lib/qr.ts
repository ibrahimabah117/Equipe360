import QRCode from 'qrcode'

/** Adresse encodée dans le QR : ouvre l'appli sur la page de pointage du site */
export function punchUrl(token: string) {
  return `${window.location.origin}/p/${token}`
}

/** Adresse encodée dans le QR d'un bulletin de paie : page publique de vérification */
export function verifyUrl(token: string) {
  return `${window.location.origin}/v/${token}`
}

/** QR code d'authentification d'un bulletin de paie */
export function payslipQrDataUrl(token: string, size = 240) {
  return QRCode.toDataURL(verifyUrl(token), { width: size, margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0B1B3F', light: '#FFFFFF' } })
}

export function qrDataUrl(token: string, size = 512) {
  return QRCode.toDataURL(punchUrl(token), {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0B1B3F', light: '#FFFFFF' },
  })
}

/** Image PNG prête à imprimer : nom du site + QR + consigne */
export async function qrPoster(token: string, siteName: string, companyName: string): Promise<string> {
  const W = 1000
  const H = 1300
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#0B1B3F'
  ctx.fillRect(0, 0, W, 170)
  ctx.fillStyle = '#FFFFFF'
  ctx.font = '600 44px Inter, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Équipe360 · Pointage', W / 2, 80)
  ctx.font = '400 30px Inter, system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.fillText(companyName, W / 2, 128)

  ctx.fillStyle = '#0B1B3F'
  ctx.font = '700 60px Inter, system-ui, sans-serif'
  ctx.fillText(siteName.length > 28 ? siteName.slice(0, 27) + '…' : siteName, W / 2, 280)

  const img = new Image()
  img.src = await qrDataUrl(token, 760)
  await img.decode()
  ctx.drawImage(img, (W - 760) / 2, 330, 760, 760)

  ctx.fillStyle = '#4A526C'
  ctx.font = '400 32px Inter, system-ui, sans-serif'
  ctx.fillText('Scannez ce code à votre arrivée et à votre départ', W / 2, 1170)
  ctx.font = '400 24px Inter, system-ui, sans-serif'
  ctx.fillStyle = '#8A93AD'
  ctx.fillText('Ne pas retirer · Ne pas photocopier', W / 2, 1220)
  return c.toDataURL('image/png')
}
