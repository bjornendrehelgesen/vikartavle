import { createClient } from '@/lib/supabase/server'
import { todayISO } from '@/lib/date'
import { redirect } from 'next/navigation'
import AdminBoard from '@/components/AdminBoard'
import type { Board, Absence, Substitution, BoardDuty, BoardBusDuty, DutyArea, BusTime } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ date?: string }>
}

export default async function AdminPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const params = await searchParams
  const date = params.date ?? todayISO()

  const { data: boardData } = await supabase
    .from('boards').select('*').eq('date', date).single()
  const board = boardData as Board | null

  let absences: Absence[] = []
  let substitutions: Substitution[] = []
  let duties: BoardDuty[] = []
  let busDuties: BoardBusDuty[] = []

  if (board) {
    const { data: absenceData } = await supabase
      .from('absences').select('*').eq('board_id', board.id)
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
    absences = (absenceData as Absence[] | null) ?? []

    if (absences.length > 0) {
      const { data: subData } = await supabase
        .from('substitutions').select('*')
        .in('absence_id', absences.map((a) => a.id))
      substitutions = (subData as Substitution[] | null) ?? []
    }

    const { data: dutiesData } = await supabase
      .from('board_duties').select('*').eq('board_id', board.id)
      .order('sort_order', { ascending: true })
    duties = (dutiesData as BoardDuty[] | null) ?? []

    const { data: busDutiesData } = await supabase
      .from('board_bus_duties').select('*').eq('board_id', board.id)
      .order('sort_order', { ascending: true })
    busDuties = (busDutiesData as BoardBusDuty[] | null) ?? []
  }

  const { data: dutyAreasData } = await supabase
    .from('duty_areas').select('*').order('sort_order', { ascending: true })
  const dutyAreas = (dutyAreasData as DutyArea[] | null) ?? []

  const { data: busTimesData } = await supabase
    .from('bus_times').select('*').order('sort_order', { ascending: true })
  const busTimes = (busTimesData as BusTime[] | null) ?? []

  return (
    <AdminBoard
      initialBoard={board}
      initialAbsences={absences}
      initialSubstitutions={substitutions}
      initialDuties={duties}
      initialBusDuties={busDuties}
      initialDutyAreas={dutyAreas}
      initialBusTimes={busTimes}
      date={date}
    />
  )
}
