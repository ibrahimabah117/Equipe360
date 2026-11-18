import { lastAccessDay, subscriptionState } from '../src/lib/format.ts'
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, a, '!=', b); process.exitCode = 1 } else console.log('ok', m) }
const t = '2026-11-18'
eq(subscriptionState(null, t), 'ok', 'sans échéance')
eq(subscriptionState('2026-12-18', t), 'ok', 'payé loin')
eq(subscriptionState('2026-11-21', t), 'ending', 'fin dans 3 jours')
eq(subscriptionState('2026-11-18', t), 'ending', 'dernier jour payé')
eq(subscriptionState('2026-11-17', t), 'grace', 'échu hier')
eq(subscriptionState('2026-11-11', t), 'grace', '7e jour de grâce')
eq(subscriptionState('2026-11-10', t), 'blocked', '8 jours après : bloqué')
eq(lastAccessDay('2026-11-28'), '2026-12-05', 'dernier jour d’accès (passage de mois)')
