'use client'

import { useEffect, useRef, useState } from 'react'
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
  const hasRightPanel = hasDuties || absences.length > 0

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: '#F7F5F2', color: '#1A1A1A' }}>
      {/* Hero header */}
      <header className="flex-shrink-0 px-10 pt-8 pb-6" style={{ borderBottom: '1px solid #E8E4E0' }}>
        <p style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: '0.75rem' }}>
          Vikartavle
        </p>
        <h1 style={{ fontSize: '5rem', fontWeight: 300, color: '#1A1A1A', letterSpacing: '-0.02em', lineHeight: 1 }}>
          {formatNorwegianDate(date)}
        </h1>
        <div style={{ marginTop: '1rem', height: '1px', width: '3rem', backgroundColor: '#C9A96E' }} />
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
          <main className="flex px-10 pt-8 pb-4 gap-0">
            {/* Absence table */}
            <div className={hasRightPanel ? 'flex-[3] pr-12' : 'flex-1'}>
              {absences.length === 0 ? (
                <div className="py-20 text-center">
                  <p style={{ fontSize: '2.5rem', fontWeight: 300, color: '#4A7C59' }}>Ingen fravær i dag</p>
                  <p style={{ fontSize: '1.25rem', fontWeight: 300, color: '#999', marginTop: '0.5rem' }}>God arbeidsdag</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', paddingBottom: '0.75rem', paddingRight: '2rem', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#999', borderBottom: '1px solid #C9A96E' }}>
                        Lærer
                      </th>
                      {periods.map((p) => (
                        <th key={p} style={{ textAlign: 'center', paddingBottom: '0.75rem', paddingLeft: '2px', paddingRight: '2px', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#999', borderBottom: '1px solid #C9A96E' }}>
                          {p}. time
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {absences.map((absence) => {
                      const rowPeriods = absence.num_periods ?? 6
                      return (
                        <tr key={absence.id} style={{ borderBottom: '1px solid #E8E4E0' }}>
                          <td style={{ fontSize: '1.875rem', fontWeight: 700, color: '#1A1A1A', padding: '1.5rem 2rem 1.5rem 0', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            {absence.teacher_initials}
                          </td>
                          {periods.map((p) => {
                            const active = p <= rowPeriods
                            const text = active ? getSubText(absence.id, p) : null

                            let bg: string, cellColor: string, label: string
                            if (!active) {
                              bg = 'transparent'; cellColor = 'transparent'; label = ''
                            } else if (text === '-') {
                              bg = '#EBEBEB'; cellColor = '#C5C0BB'; label = '—'
                            } else if (text) {
                              bg = '#4A7C59'; cellColor = '#FFFFFF'; label = text
                            } else {
                              bg = '#D4846A'; cellColor = '#E8A892'; label = '—'
                            }

                            return (
                              <td
                                key={p}
                                style={{
                                  backgroundColor: bg,
                                  padding: '0 2px',
                                  verticalAlign: 'middle',
                                }}
                              >
                                <div style={{
                                  fontSize: '1.5rem',
                                  fontWeight: 700,
                                  color: cellColor,
                                  textAlign: 'center',
                                  padding: '1.5rem 0.5rem',
                                }}>
                                  {label}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Right panel: Vakter, Bussvakter, Oversikt */}
            {hasRightPanel && (
              <div className="flex-[1] flex flex-col gap-8 min-w-0" style={{ borderLeft: '1px solid #E8E4E0', paddingLeft: '2.5rem' }}>
                {duties.length > 0 && (
                  <section>
                    <p style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#999', marginBottom: '0.75rem' }}>
                      Vakter
                    </p>
                    <div>
                      {duties.map((duty) => {
                        const hasName = duty.assigned_to && duty.assigned_to !== '-'
                        return (
                          <div key={duty.id} style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid #E8E4E0' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: '1rem', fontWeight: 600, color: '#1A1A1A' }}>{duty.area}</span>
                              {duty.time_slot && <span style={{ fontSize: '0.8rem', color: '#999', marginLeft: '0.5rem' }}>{duty.time_slot}</span>}
                            </div>
                            <span style={{ fontSize: '1.125rem', fontWeight: 700, color: hasName ? '#4A7C59' : '#D4846A', marginLeft: '1rem', flexShrink: 0 }}>
                              {duty.assigned_to || '–'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}

                {busDuties.length > 0 && (
                  <section>
                    <p style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#999', marginBottom: '0.75rem' }}>
                      Bussvakter
                    </p>
                    <div>
                      {busDuties.map((duty) => {
                        const hasName = duty.assigned_to && duty.assigned_to !== '-'
                        return (
                          <div key={duty.id} style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid #E8E4E0' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: '1rem', fontWeight: 600, color: '#1A1A1A' }}>{duty.direction || ''}</span>
                              {duty.time_label && <span style={{ fontSize: '0.8rem', color: '#999', marginLeft: '0.5rem' }}>{duty.time_label}</span>}
                            </div>
                            <span style={{ fontSize: '1.125rem', fontWeight: 700, color: hasName ? '#4A7C59' : '#D4846A', marginLeft: '1rem', flexShrink: 0 }}>
                              {duty.assigned_to || '–'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}

                {(absences.length > 0 || board?.extra_absent || board?.extra_partial_day) && (
                  <section>
                    <p style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#999', marginBottom: '0.75rem' }}>
                      Oversikt
                    </p>
                    <div style={{ borderTop: '1px solid #E8E4E0' }}>
                      <div style={{ padding: '0.75rem 0', borderBottom: '1px solid #E8E4E0' }}>
                        <p style={{ fontSize: '0.55rem', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C5C0BB', marginBottom: '0.25rem' }}>Fravær</p>
                        <p style={{ fontSize: '0.9rem', fontWeight: 500, color: '#1A1A1A', lineHeight: 1.5 }}>
                          {[
                            ...absences.filter((a) => a.is_absent !== false).map((a) => a.teacher_initials),
                            ...(board?.extra_absent ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
                          ].join(', ') || '–'}
                        </p>
                      </div>
                      <div style={{ padding: '0.75rem 0' }}>
                        <p style={{ fontSize: '0.55rem', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C5C0BB', marginBottom: '0.25rem' }}>Deler av dag</p>
                        <p style={{ fontSize: '0.9rem', fontWeight: 500, color: '#1A1A1A', lineHeight: 1.5 }}>
                          {[
                            ...absences.filter((a) => a.is_absent === false).map((a) => a.teacher_initials),
                            ...(board?.extra_partial_day ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
                          ].join(', ') || '–'}
                        </p>
                      </div>
                    </div>
                  </section>
                )}
              </div>
            )}
          </main>

          {/* Informasjon — full-width bottom strip */}
          {board?.info_text && (
            <footer className="px-10 py-6 mt-4" style={{ borderTop: '1px solid #E8E4E0' }}>
              <p style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#999', marginBottom: '0.5rem' }}>
                Informasjon
              </p>
              <p style={{ fontSize: '1.25rem', fontStyle: 'italic', fontWeight: 300, color: '#555', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {board.info_text}
              </p>
            </footer>
          )}

        </div>{/* end pageContentRef */}
      </div>{/* end pageContainerRef */}
    </div>
  )
}
