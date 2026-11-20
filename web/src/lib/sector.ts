// Équipe360 parle le langage du métier de chaque client.
// Un même logiciel : seuls les mots, les exemples et les modèles changent selon le secteur.
import { useCompany } from './company'

interface Word {
  /** singulier, pluriel */
  s: string
  p: string
  /** féminin (accord : prévue/prévu, aucune/aucun…) */
  fem: boolean
}

interface SectorDef {
  site: Word
  worker: Word
  shift: Word
  /** chef sur le terrain */
  lead: string
  siteExamples: string
  jobTitles: string[]
  /** exemples pour le modèle d'import Excel */
  importExamples: { job: string; site: string }[]
}

const w = (s: string, p: string, fem = false): Word => ({ s, p, fem })

const DEFS: Record<string, SectorDef> = {
  gardiennage: {
    site: w('site', 'sites'),
    worker: w('agent', 'agents'),
    shift: w('garde', 'gardes', true),
    lead: 'chef de poste',
    siteExamples: 'agences, ambassades, entrepôts, résidences…',
    jobTitles: ['Agent de sécurité', 'Chef de poste', 'Superviseur', 'Maître-chien', 'Chauffeur', 'Agent d’entretien'],
    importExamples: [
      { job: 'Agent de sécurité', site: 'Banque Centrale - Kaloum' },
      { job: 'Chef de poste', site: 'Ambassade - Ratoma' },
    ],
  },
  usine: {
    site: w('atelier', 'ateliers'),
    worker: w('employé', 'employés'),
    shift: w('poste', 'postes'),
    lead: 'chef d’équipe',
    siteExamples: 'lignes de production, magasin, maintenance, bureaux…',
    jobTitles: ['Opérateur de ligne', 'Chef d’équipe', 'Cariste', 'Magasinier', 'Technicien maintenance', 'Contrôleur qualité', 'Manutentionnaire'],
    importExamples: [
      { job: 'Opérateur de ligne', site: 'Ligne 1 - Embouteillage' },
      { job: 'Cariste', site: 'Magasin & Expédition' },
    ],
  },
  btp: {
    site: w('chantier', 'chantiers'),
    worker: w('ouvrier', 'ouvriers'),
    shift: w('journée', 'journées', true),
    lead: 'chef de chantier',
    siteExamples: 'immeubles, routes, villas, ouvrages…',
    jobTitles: ['Maçon', 'Ferrailleur', 'Coffreur', 'Manœuvre', 'Électricien', 'Plombier', 'Conducteur d’engin', 'Chef de chantier', 'Gardien de chantier'],
    importExamples: [
      { job: 'Maçon', site: 'Immeuble Kipé' },
      { job: 'Manœuvre', site: 'Route Lambanyi' },
    ],
  },
  mines: {
    site: w('site', 'sites'),
    worker: w('employé', 'employés'),
    shift: w('poste', 'postes'),
    lead: 'superviseur',
    siteExamples: 'fosses, carrières, base vie, port, atelier mécanique…',
    jobTitles: ['Conducteur d’engin', 'Chauffeur camion', 'Mécanicien', 'Foreur', 'Opérateur', 'Manœuvre', 'Superviseur', 'Agent HSE', 'Électricien'],
    importExamples: [
      { job: 'Conducteur d’engin', site: 'Fosse Nord - Boké' },
      { job: 'Mécanicien', site: 'Atelier - Base vie' },
    ],
  },
  ecole: {
    site: w('site', 'sites'),
    worker: w('employé', 'employés'),
    shift: w('créneau', 'créneaux'),
    lead: 'responsable',
    siteExamples: 'campus, primaire, collège, lycée…',
    jobTitles: ['Enseignant', 'Enseignant vacataire', 'Directeur des études', 'Surveillant', 'Secrétaire', 'Comptable', 'Gardien', 'Agent d’entretien'],
    importExamples: [
      { job: 'Enseignant', site: 'Collège - Ratoma' },
      { job: 'Surveillant', site: 'Lycée - Ratoma' },
    ],
  },
  nettoyage: {
    site: w('site', 'sites'),
    worker: w('agent', 'agents'),
    shift: w('vacation', 'vacations', true),
    lead: 'chef d’équipe',
    siteExamples: 'bureaux, banques, cliniques, résidences…',
    jobTitles: ['Agent d’entretien', 'Chef d’équipe', 'Laveur de vitres', 'Superviseur', 'Chauffeur'],
    importExamples: [
      { job: 'Agent d’entretien', site: 'Banque - Kaloum' },
      { job: 'Chef d’équipe', site: 'Clinique - Dixinn' },
    ],
  },
  commerce: {
    site: w('magasin', 'magasins'),
    worker: w('employé', 'employés'),
    shift: w('poste', 'postes'),
    lead: 'chef de rayon',
    siteExamples: 'boutiques, supermarchés, dépôts…',
    jobTitles: ['Vendeur', 'Caissier', 'Magasinier', 'Chef de rayon', 'Livreur', 'Gérant'],
    importExamples: [
      { job: 'Vendeur', site: 'Boutique Madina' },
      { job: 'Caissier', site: 'Supermarché Kipé' },
    ],
  },
  sante: {
    site: w('service', 'services'),
    worker: w('agent', 'agents'),
    shift: w('garde', 'gardes', true),
    lead: 'major',
    siteExamples: 'urgences, maternité, laboratoire, accueil…',
    jobTitles: ['Infirmier', 'Sage-femme', 'Aide-soignant', 'Médecin', 'Laborantin', 'Major', 'Agent d’accueil'],
    importExamples: [
      { job: 'Infirmier', site: 'Urgences' },
      { job: 'Sage-femme', site: 'Maternité' },
    ],
  },
  hotellerie: {
    site: w('service', 'services'),
    worker: w('employé', 'employés'),
    shift: w('poste', 'postes'),
    lead: 'chef de service',
    siteExamples: 'réception, cuisine, salle, étages…',
    jobTitles: ['Réceptionniste', 'Cuisinier', 'Serveur', 'Femme de chambre', 'Plongeur', 'Chef de service'],
    importExamples: [
      { job: 'Réceptionniste', site: 'Réception' },
      { job: 'Cuisinier', site: 'Cuisine' },
    ],
  },
  autre: {
    site: w('site', 'sites'),
    worker: w('employé', 'employés'),
    shift: w('poste', 'postes'),
    lead: 'responsable',
    siteExamples: 'bureaux, dépôts, agences…',
    jobTitles: ['Employé', 'Chef d’équipe', 'Chauffeur', 'Agent d’entretien', 'Gardien'],
    importExamples: [
      { job: 'Employé', site: 'Siège - Kaloum' },
      { job: 'Chauffeur', site: 'Dépôt Matoto' },
    ],
  },
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const vowel = (t: string) => /^[aeiouyéèêàâîôûh]/i.test(t)

function build(def: SectorDef) {
  const { site, worker, shift } = def
  const e = (word: Word, n = 1) => (word.fem ? 'e' : '') + (n > 1 ? 's' : '')
  return {
    // lieux
    site: site.s,
    sites: site.p,
    Site: cap(site.s),
    Sites: cap(site.p),
    leSite: vowel(site.s) ? `l’${site.s}` : `le ${site.s}`,
    duSite: vowel(site.s) ? `de l’${site.s}` : `du ${site.s}`,
    ceSite: vowel(site.s) ? `cet ${site.s}` : `ce ${site.s}`,
    unSite: `un ${site.s}`,
    auSite: vowel(site.s) ? `à l’${site.s}` : `au ${site.s}`,
    // personnel
    worker: worker.s,
    workers: worker.p,
    Worker: cap(worker.s),
    Workers: cap(worker.p),
    // horaires
    shift: shift.s,
    shifts: shift.p,
    Shift: cap(shift.s),
    Shifts: cap(shift.p),
    unShift: `${shift.fem ? 'une' : 'un'} ${shift.s}`,
    aucunShift: `${shift.fem ? 'aucune' : 'aucun'} ${shift.s}`,
    TousShifts: `${shift.fem ? 'Toutes' : 'Tous'} les ${shift.p}`,
    AucunShift: `${shift.fem ? 'Aucune' : 'Aucun'} ${shift.s}`,
    laShift: vowel(shift.s) ? `l’${shift.s}` : `${shift.fem ? 'la' : 'le'} ${shift.s}`,
    AuShift: shift.fem ? `À la ${shift.s}` : vowel(shift.s) ? `À l’${shift.s}` : `Au ${shift.s}`,
    duShift: shift.fem ? `de la ${shift.s}` : vowel(shift.s) ? `de l’${shift.s}` : `du ${shift.s}`,
    ceShift: `${shift.fem ? 'cette' : vowel(shift.s) ? 'cet' : 'ce'} ${shift.s}`,
    /** accord avec le mot « garde/poste » : '', 'e', 's', 'es' */
    sx: (n = 1) => e(shift, n),
    /** « 3 gardes », « 1 poste » */
    nShifts: (n: number) => `${n} ${n > 1 ? shift.p : shift.s}`,
    nWorkers: (n: number) => `${n} ${n > 1 ? worker.p : worker.s}`,
    nSites: (n: number) => `${n} ${n > 1 ? site.p : site.s}`,
    lead: def.lead,
    Lead: cap(def.lead),
    siteExamples: def.siteExamples,
    jobTitles: def.jobTitles,
    importExamples: def.importExamples,
  }
}

export type Vocab = ReturnType<typeof build>

const CACHE: Record<string, Vocab> = {}

/** Vocabulaire d'un secteur (gardiennage par défaut, pour les anciens clients) */
export function vocabFor(sector: string | null | undefined): Vocab {
  const key = sector && DEFS[sector] ? sector : sector ? 'autre' : 'gardiennage'
  return (CACHE[key] ??= build(DEFS[key]))
}

/** Vocabulaire de l'entreprise affichée */
export function useVocab(): Vocab {
  const { company } = useCompany()
  return vocabFor(company.sector)
}
