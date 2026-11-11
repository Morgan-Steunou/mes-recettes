// Dates de jour (« 2026-11-02 », sans heure), toujours lues dans le fuseau du navigateur :
// new Date('2026-11-02') serait lu en UTC et pourrait afficher la veille.

export function parseDay(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function toDayISO(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function todayISO() {
  return toDayISO(new Date())
}

const longFormat = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const shortFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

// « dimanche 2 novembre 2026 »
export function formatDayLong(iso) {
  return longFormat.format(parseDay(iso))
}

// « 2 novembre 2026 »
export function formatDay(iso) {
  return shortFormat.format(parseDay(iso))
}

// Nombre de jours entre le jour iso et aujourd'hui (0 = aujourd'hui)
export function daysAgo(iso, today = new Date()) {
  const start = parseDay(toDayISO(today))
  return Math.round((start - parseDay(iso)) / 86_400_000)
}

// « aujourd'hui », « hier », « il y a 5 jours », « il y a 3 semaines », « il y a 2 mois »,
// puis la date au-delà d'un an
export function relativeDay(iso, today = new Date()) {
  const days = daysAgo(iso, today)
  if (days <= 0) return "aujourd'hui"
  if (days === 1) return 'hier'
  if (days < 14) return `il y a ${days} jours`
  if (days < 60) return `il y a ${Math.floor(days / 7)} semaines`
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`
  return `le ${formatDay(iso)}`
}

// Périodes proposées par la page Historique : bornes { since, until } au format « AAAA-MM-JJ »
// (null = pas de borne). « Tout » n'a aucune borne.
export const PERIODS = [
  { key: 'tout', label: 'Tout' },
  { key: '30j', label: '30 derniers jours' },
  { key: '3m', label: '3 derniers mois' },
  { key: 'annee', label: 'Cette année' },
]

export function periodRange(key, today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  switch (key) {
    case '30j':
      start.setDate(start.getDate() - 29)
      return { since: toDayISO(start), until: null }
    case '3m':
      start.setMonth(start.getMonth() - 3)
      return { since: toDayISO(start), until: null }
    case 'annee':
      return { since: `${today.getFullYear()}-01-01`, until: null }
    default:
      return { since: null, until: null }
  }
}

const monthFormat = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })

// « novembre 2026 », pour regrouper l'historique par mois
export function formatMonth(iso) {
  return monthFormat.format(parseDay(iso))
}
