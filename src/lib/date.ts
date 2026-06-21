export function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function formatNorwegianDate(isoDate: string): string {
  const date = new Date(isoDate + 'T12:00:00')
  return date.toLocaleDateString('nb-NO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(isoDate + 'T12:00:00')
  date.setDate(date.getDate() + days)
  return toISODate(date)
}
