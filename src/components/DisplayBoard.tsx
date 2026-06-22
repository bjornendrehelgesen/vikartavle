'use client'

import { useEffect, useRef, useState, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatNorwegianDate } from '@/lib/date'
import type { Board, Absence, Substitution, BoardDuty, BoardBusDuty } from '@/lib/supabase/types'

interface Props {
  initialBoard: Board | null
  initialAbsences: Absence[]
  initialSubstitutions: Substitution[]
  initialDuties: BoardDuty[]
  initialBusDuties: BoardBusDuty[]
  date: string
}

export default function DisplayBoard({
  initialBoard,
  initialAbsences,
  initialSubstitutions,
  initialDuties,
  initialBusDuties,
  date,
}: Props) {
  const [board, setBoard] = useState<Board | null>(initialBoard)
  const [absences, setAbsences] = useState<Absence[]>(initialAbsences)
  const [substitutions, setSubstitutions] = useState<Substitution[]>(initialSubstitutions)
  const [duties, setDuties] = useState<BoardDuty[]>(initialDuties)
  const [busDuties, setBusDuties] = useState<BoardBusDuty[]>(initialBusDuties)

  const supabase = createClient()
  const pageContainerRef = useRef<HTMLDivElement>(null)
  const pageContentRef = useRef<HTMLDivElement>(null)
  const [pageScale, setPageScale] = useState(1)

  useEffect(() => {
    function computeScale() {
      const container = pageContainerRef.current
      const content = pageContentRef.current
      if (!container || !content) return
      const ratio = container.clientHeight / content.scrollHeight
      setPageScale(ratio < 1 ? ratio : 1)
    }
    computeScale()
    const ro = new ResizeObserver(computeScale)
    if (pageContainerRef.current) ro.observe(pageContainerRef.current)
    if (pageContentRef.current) ro.observe(pageContentRef.current)
    return () => ro.disconnect()
  }, [absences, duties, busDuties])

  useEffect(() => {
    async function refetchAll(boardId: string) {
      const [absRes, dutyRes, busRes] = await Promise.all([
        supabase.from('absences').select('*').eq('board_id', boardId)
          .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
        supabase.from('board_duties').select('*').eq('board_id', boardId)
          .order('sort_order', { ascending: true }),
        supabase.from('board_bus_duties').select('*').eq('board_id', boardId)
          .order('sort_order', { ascending: true }),
      ])

      const newAbsences = (absRes.data as Absence[] | null) ?? []
      setAbsences(newAbsences)
      setDuties((dutyRes.data as BoardDuty[] | null) ?? [])
      setBusDuties((busRes.data as BoardBusDuty[] | null) ?? [])

      if (newAbsences.length > 0) {
        const { data: filteredSubs } = await supabase
          .from('substitutions').select('*')
          .in('absence_id', newAbsences.map((a) => a.id))
        setSubstitutions((filteredSubs as Substitution[] | null) ?? [])
      } else {
        setSubstitutions([])
      }
    }

    async function refetchBoard() {
      const { data } = await supabase.from('boards').select('*').eq('date', date).single()
      const b = data as Board | null
      setBoard(b)
      if (b) refetchAll(b.id)
    }

    const boardId = board?.id

    const ch1 = supabase.channel('disp-boards')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boards' }, refetchBoard)
      .subscribe()

    const ch2 = supabase.channel('disp-absences')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'absences' }, () => {
        if (boardId) refetchAll(boardId)
      })
      .subscribe()

    const ch3 = supabase.channel('disp-subs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'substitutions' }, () => {
        if (boardId) refetchAll(boardId)
      })
      .subscribe()

    const ch4 = supabase.channel('disp-duties')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_duties' }, () => {
        if (boardId) refetchAll(boardId)
      })
      .subscribe()

    const ch5 = supabase.channel('disp-bus')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_bus_duties' }, () => {
        if (boardId) refetchAll(boardId)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(ch1)
      supabase.removeChannel(ch2)
      supabase.removeChannel(ch3)
      supabase.removeChannel(ch4)
      supabase.removeChannel(ch5)
    }
  }, [date, board?.id])

  function getSubText(absenceId: string, period: number): string {
    return substitutions.find(
      (s) => s.absence_id === absenceId && s.period_number === period
    )?.substitute_text ?? ''
  }

  const maxPeriods = absences.length > 0
    ? Math.max(...absences.map((a) => a.num_periods ?? 6))
    : 6
  const periods = Array.from({ length: maxPeriods }, (_, i) => i + 1)

  const hasDuties = duties.length > 0 || busDuties.length > 0

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Header */}
      <header className="bg-slate-800 text-white px-8 py-6 shadow-lg flex-shrink-0">
        <h1 className="text-4xl font-bold tracking-wide capitalize">
          {formatNorwegianDate(date)}
        </h1>
        <p className="text-slate-300 text-lg mt-1">Vikartavle</p>
      </header>

      {/* Scalable content area */}
      <div ref={pageContainerRef} className="flex-1 overflow-hidden relative">
        <div
          ref={pageContentRef}
          className="absolute top-0 left-0 flex flex-col"
          style={{
            transform: `scale(${pageScale})`,
            transformOrigin: 'top left',
            width: `${(1 / pageScale) * 100}%`,
          }}
        >

      {/* Main */}
      <main className="flex gap-4 p-5">
        {/* Absences card */}
        <div className={`${hasDuties ? 'flex-[3]' : 'flex-1'} bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col shadow-sm`}>
          <div className="bg-slate-700 text-white px-5 py-3 font-bold text-2xl">
            Vikartavle
          </div>
          {absences.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
              <p className="text-4xl font-semibold text-green-700">Ingen fravær registrert i dag</p>
              <p className="text-green-500 text-2xl mt-3">God arbeidsdag!</p>
            </div>
          ) : (
            <div className="flex-1 overflow-x-auto">
                <table className="w-full border-collapse text-2xl">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                      <th className="text-left px-5 py-3 font-semibold w-28">Lærer</th>
                      {periods.map((p) => (
                        <th key={p} className="px-3 py-3 font-semibold text-center">{p}. time</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {absences.map((absence) => {
                      const rowPeriods = absence.num_periods ?? 6
                      return (
                        <tr key={absence.id}>
                          <td className="px-5 py-3 font-bold text-slate-800 border-r border-slate-100">
                            {absence.teacher_initials}
                          </td>
                          {periods.map((p) => {
                            const active = p <= rowPeriods
                            const text = active ? getSubText(absence.id, p) : null
                            const cellStyle = !active
                              ? { backgroundColor: '#f1f5f9', color: '#cbd5e1', borderColor: '#e2e8f0' }
                              : text === '-'
                              ? { backgroundColor: '#e2e8f0', color: '#64748b', borderColor: '#cbd5e1' }
                              : text
                              ? { backgroundColor: '#86efac', color: '#14532d', borderColor: '#4ade80' }
                              : { backgroundColor: '#ef4444', color: '#ffffff', borderColor: '#dc2626' }
                            return (
                              <td key={p} className="px-2 py-2 text-center border-r border-slate-100 last:border-r-0">
                                <div
                                  className="inline-block w-full rounded-lg px-3 py-2.5 font-semibold border"
                                  style={cellStyle}
                                >
                                  {active ? (text || '–') : ''}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
            </div>
          )}
        </div>

        {/* Duties: stacked cards */}
        {hasDuties && (
          <div className="flex-[1] flex flex-col gap-4 min-w-0">
            {/* Vakter */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-slate-700 text-white px-4 py-3 font-bold text-2xl text-center tracking-wide">
                Vakter
              </div>
              {duties.length === 0 ? (
                <div className="py-6 text-center text-slate-300 text-xl">–</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'max-content max-content 1fr' }}>
                  {duties.map((duty) => {
                    const assignedStyle = duty.assigned_to === '-'
                      ? { backgroundColor: '#e2e8f0', color: '#64748b' }
                      : duty.assigned_to
                      ? { backgroundColor: '#86efac', color: '#14532d' }
                      : { backgroundColor: '#ef4444', color: '#ffffff' }
                    return (
                      <Fragment key={duty.id}>
                        <div className="pl-4 pr-2 py-3 font-bold text-slate-800 text-xl whitespace-nowrap border-b border-slate-100 flex items-center">{duty.area}</div>
                        <div className="pl-2 pr-4 py-3 font-bold text-slate-800 text-xl whitespace-nowrap border-b border-slate-100 flex items-center">{duty.time_slot}</div>
                        <div className="border-b border-slate-100 flex items-center">
                          <div className="flex-1 mx-3 my-2 rounded-lg px-3 py-2.5 font-bold text-center text-xl" style={assignedStyle}>
                            {duty.assigned_to || '–'}
                          </div>
                        </div>
                      </Fragment>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Bussvakter */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-slate-700 text-white px-4 py-3 font-bold text-2xl text-center tracking-wide">
                Bussvakter
              </div>
              {busDuties.length === 0 ? (
                <div className="py-6 text-center text-slate-300 text-xl">–</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'max-content max-content 1fr' }}>
                  {busDuties.map((duty) => {
                    const assignedStyle = duty.assigned_to === '-'
                      ? { backgroundColor: '#e2e8f0', color: '#64748b' }
                      : duty.assigned_to
                      ? { backgroundColor: '#86efac', color: '#14532d' }
                      : { backgroundColor: '#ef4444', color: '#ffffff' }
                    return (
                      <Fragment key={duty.id}>
                        <div className="pl-4 pr-2 py-3 font-bold text-slate-800 text-xl whitespace-nowrap border-b border-slate-100 flex items-center">{duty.direction || ''}</div>
                        <div className="pl-2 pr-4 py-3 font-bold text-slate-800 text-xl whitespace-nowrap border-b border-slate-100 flex items-center">{duty.time_label}</div>
                        <div className="border-b border-slate-100 flex items-center">
                          <div className="flex-1 mx-3 my-2 rounded-lg px-3 py-2.5 font-bold text-center text-xl" style={assignedStyle}>
                            {duty.assigned_to || '–'}
                          </div>
                        </div>
                      </Fragment>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer: info (2/3) + absence summary (1/3) */}
      {(board?.info_text || absences.length > 0 || board?.extra_absent || board?.extra_partial_day) && (
        <footer className="px-5 pb-5 flex gap-4">
          {/* Informasjon card: 2/3 */}
          <div className="flex-[3] bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="bg-slate-700 text-white px-4 py-3 font-bold text-xl tracking-wide">
              Informasjon
            </div>
            <div className="px-5 py-4">
              {board?.info_text
                ? <p className="text-2xl text-slate-700 whitespace-pre-wrap leading-relaxed">{board.info_text}</p>
                : <p className="text-slate-300 text-xl">–</p>
              }
            </div>
          </div>

          {/* Fravær & Deler av dag card: 1/3 */}
          <div className="flex-[1] bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
            <div className="bg-slate-700 text-white px-4 py-3 font-bold text-xl tracking-wide text-center">
              Oversikt
            </div>
            <div className="flex-1 divide-y divide-slate-100">
              <div className="px-4 py-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Fravær</p>
                <p className="text-xl font-semibold text-slate-700 leading-snug">
                  {[
                    ...absences.filter((a) => a.is_absent !== false).map((a) => a.teacher_initials),
                    ...(board?.extra_absent ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
                  ].join(', ') || '–'}
                </p>
              </div>
              <div className="px-4 py-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Deler av dag</p>
                <p className="text-xl font-semibold text-slate-700 leading-snug">
                  {[
                    ...absences.filter((a) => a.is_absent === false).map((a) => a.teacher_initials),
                    ...(board?.extra_partial_day ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
                  ].join(', ') || '–'}
                </p>
              </div>
            </div>
          </div>
        </footer>
      )}

        </div>{/* end pageContentRef */}
      </div>{/* end pageContainerRef */}
    </div>
  )
}
