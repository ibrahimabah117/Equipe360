import type { Punch } from './supabase'

/** Alertes posées par le serveur sur chaque pointage (fonction punch) */
export type PunchFlag =
  | 'hors_zone'
  | 'sans_gps'
  | 'gps_imprecis'
  | 'position_figee'
  | 'appareil_partage'
  | 'sans_photo'
  | 'envoi_tardif'
  | 'saisie_responsable'

export const FLAG_INFO: Record<PunchFlag, { label: string; hint: string; suspect: boolean }> = {
  appareil_partage: { label: 'Téléphone partagé', hint: 'Le même téléphone a servi à pointer pour un autre agent dans les 12 h.', suspect: true },
  position_figee: { label: 'Position figée', hint: 'Exactement la même position qu’un ancien pointage : possible fausse localisation.', suspect: true },
  hors_zone: { label: 'Hors zone', hint: 'Position en dehors du rayon du site.', suspect: true },
  sans_photo: { label: 'Sans selfie', hint: 'Le selfie est obligatoire mais n’a pas été reçu.', suspect: true },
  sans_gps: { label: 'Sans GPS', hint: 'Aucune position transmise.', suspect: true },
  gps_imprecis: { label: 'GPS imprécis', hint: 'Le téléphone annonçait une précision de plus de 100 m.', suspect: true },
  envoi_tardif: { label: 'Envoyé en retard', hint: 'Reçu plus de 30 min après l’heure affichée (hors ligne ou horloge modifiée).', suspect: false },
  saisie_responsable: { label: 'Saisi par un responsable', hint: 'Pointage fait par un responsable pour l’agent.', suspect: false },
}

/** Ordre d'affichage : les plus graves d'abord */
const ORDER = Object.keys(FLAG_INFO) as PunchFlag[]

export function punchFlags(p: Pick<Punch, 'flags' | 'gps_ok' | 'distance_m'>): PunchFlag[] {
  const list = (p.flags ?? []).filter((f): f is PunchFlag => f in FLAG_INFO)
  // Pointages enregistrés avant les alertes : on garde l'ancien signal « hors zone »
  if (!p.flags?.length && p.distance_m != null && !p.gps_ok) list.push('hors_zone')
  return list.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
}

export function suspectFlags(p: Pick<Punch, 'flags' | 'gps_ok' | 'distance_m'>): PunchFlag[] {
  return punchFlags(p).filter((f) => FLAG_INFO[f].suspect)
}

export function isSuspect(p: Pick<Punch, 'flags' | 'gps_ok' | 'distance_m'> | null | undefined): boolean {
  return !!p && suspectFlags(p).length > 0
}
