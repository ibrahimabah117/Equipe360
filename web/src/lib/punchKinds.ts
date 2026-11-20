// Types de pointage : arrivée, départ, et (si l'entreprise l'active) début / fin de pause
export type PunchKind = 'in' | 'out' | 'break_start' | 'break_end'

export const KIND_LABEL: Record<PunchKind, string> = {
  in: 'Arrivée',
  out: 'Départ',
  break_start: 'Début de pause',
  break_end: 'Fin de pause',
}

export const KIND_HINT: Record<PunchKind, string> = {
  in: 'Je prends mon poste',
  out: 'Je quitte mon poste',
  break_start: 'Je pars en pause',
  break_end: 'Je reprends le travail',
}

export const isBreak = (k: string) => k === 'break_start' || k === 'break_end'
