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

const DIVIDER = '0.5px solid #D8D4CC'
const ROW_DIV = '0.5px solid #E8E5E0'

export default function DisplayBoard({
  initialBoard,
  initialAbsences,
  initialSubstitutions,
  initialDuties,
  initialBusDuties,
  date,
}: Props) {
  const [board, setBoard] = useState<Board | null>(initialBoard)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [absences, setAbsences] = useState<Absence[]>(initialAbsences)
  const [substitutions, setSubstitutions] = useState<Substitution[]>(initialSubstitutions)
  const [duties, setDuties] = useState<BoardDuty[]>(initialDuties)
  const [busDuties, setBusDuties] = useState<BoardBusDuty[]>(initialBusDuties)

  const supabase = createClient()

  const rightContainerRef = useRef<HTMLDivElement>(null)
  const rightContentRef = useRef<HTMLDivElement>(null)
  const [rightScale, setRightScale] = useState(1)

  const leftContainerRef = useRef<HTMLDivElement>(null)
  const leftContentRef = useRef<HTMLDivElement>(null)
  const [leftScale, setLeftScale] = useState(1)

  useEffect(() => {
    function compute() {
      const c = rightContainerRef.current
      const n = rightContentRef.current
      if (!c || !n) return
      const ratio = c.clientHeight / n.scrollHeight
      setRightScale(ratio < 1 ? ratio : 1)
    }
    compute()
    const ro = new ResizeObserver(compute)
    if (rightContainerRef.current) ro.observe(rightContainerRef.current)
    if (rightContentRef.current) ro.observe(rightContentRef.current)
    return () => ro.disconnect()
  }, [duties, busDuties, absences, board])

  useEffect(() => {
    function compute() {
      const c = leftContainerRef.current
      const n = leftContentRef.current
      if (!c || !n) return
      const ratio = c.clientHeight / n.scrollHeight
      setLeftScale(ratio < 1 ? ratio : 1)
    }
    compute()
    const ro = new ResizeObserver(compute)
    if (leftContainerRef.current) ro.observe(leftContainerRef.current)
    if (leftContentRef.current) ro.observe(leftContentRef.current)
    return () => ro.disconnect()
  }, [absences])

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
      setLastUpdated(new Date())
    }

    async function refetchBoard() {
      const { data } = await supabase.from('boards').select('*').eq('date', date).single()
      const b = data as Board | null
      setBoard(b)
      if (b) refetchAll(b.id)
      else setLastUpdated(new Date())
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
  const hasOversikt = absences.length > 0 || !!(board?.extra_absent) || !!(board?.extra_partial_day)
  const showRightPanel = hasDuties || hasOversikt

  const legend = [
    { label: 'Vikar satt inn', bg: '#4A7C59' },
    { label: 'Mangler vikar', bg: '#C9785C' },
    { label: 'Ikke aktuelt', bg: '#DDDBD7' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', backgroundColor: '#F7F5F2', color: '#1A1A1A', overflow: 'hidden' }}>

      {/* Header */}
      <header style={{ padding: '32px 48px 26px', borderBottom: DIVIDER, flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#AAA', marginBottom: '6px' }}>
            Vikartavle
          </p>
          <h1 style={{ fontSize: '52px', fontWeight: 300, letterSpacing: '-0.02em', color: '#1A1A1A', lineHeight: 1.1 }}>
            {formatNorwegianDate(date)}
          </h1>
        </div>
        <div style={{ textAlign: 'right', paddingTop: '6px' }}>
          <p style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#CCC', marginBottom: '4px' }}>
            Sist oppdatert
          </p>
          <p style={{ fontSize: '18px', fontWeight: 300, color: '#BBB', fontVariantNumeric: 'tabular-nums' }}>
            {lastUpdated.toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </header>

      {/* Body */}
      <div style={{ display: 'grid', gridTemplateColumns: showRightPanel ? '1fr 375px' : '1fr', flex: 1, minHeight: 0 }}>

        {/* Left: substitution table */}
        <div ref={leftContainerRef} style={{ borderRight: showRightPanel ? DIVIDER : 'none', overflow: 'hidden', position: 'relative' }}>

          {absences.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '30px 48px' }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '2rem', fontWeight: 300, color: '#4A7C59' }}>Ingen fravær i dag</p>
                <p style={{ fontSize: '1rem', fontWeight: 300, color: '#AAA', marginTop: '0.5rem' }}>God arbeidsdag</p>
              </div>
            </div>
          ) : (
            <div
              ref={leftContentRef}
              style={{
                padding: '30px 48px 32px',
                transformOrigin: 'top left',
                transform: `scale(${leftScale})`,
                width: leftScale < 1 ? `${(1 / leftScale) * 100}%` : '100%',
              }}
            >
            <>
              {/* Legend */}
              <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '22px', flexShrink: 0 }}>
                {legend.map(({ label, bg }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '10px', fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#AAA' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: bg, flexShrink: 0 }} />
                    {label}
                  </div>
                ))}
              </div>

              {/* Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', width: '90px', fontSize: '11px', fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#AAA', paddingBottom: '16px', borderBottom: DIVIDER }}>
                      Lærer
                    </th>
                    {periods.map((p) => (
                      <th key={p} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#AAA', paddingBottom: '16px', borderBottom: DIVIDER }}>
                        {p}. time
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {absences.map((absence, idx) => {
                    const rowPeriods = absence.num_periods ?? 6
                    const isLast = idx === absences.length - 1
                    return (
                      <tr key={absence.id}>
                        <td style={{ fontSize: '30px', fontWeight: 300, letterSpacing: '0.04em', color: '#1A1A1A', paddingLeft: 0, paddingTop: '10px', paddingBottom: '10px', paddingRight: '6px', verticalAlign: 'middle', borderBottom: isLast ? 'none' : ROW_DIV }}>
                          {absence.teacher_initials}
                        </td>
                        {periods.map((p) => {
                          const active = p <= rowPeriods
                          const text = active ? getSubText(absence.id, p) : null

                          let cellStyle: React.CSSProperties
                          let label: string

                          if (!active) {
                            return (
                              <td key={p} style={{ padding: '10px 6px', verticalAlign: 'middle', borderBottom: isLast ? 'none' : ROW_DIV }} />
                            )
                          } else if (text === '-') {
                            cellStyle = { height: '64px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 300, letterSpacing: '0.06em', margin: '3px', backgroundColor: '#DDDBD7', color: '#BCB9B4' }
                            label = '—'
                          } else if (text) {
                            cellStyle = { height: '64px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 500, letterSpacing: '0.06em', margin: '3px', backgroundColor: '#4A7C59', color: '#ffffff' }
                            label = text
                          } else {
                            cellStyle = { height: '64px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 300, letterSpacing: '0.06em', margin: '3px', backgroundColor: '#C9785C', color: 'rgba(255,255,255,0.85)' }
                            label = '—'
                          }

                          return (
                            <td key={p} style={{ padding: '10px 6px', verticalAlign: 'middle', borderBottom: isLast ? 'none' : ROW_DIV }}>
                              <div style={cellStyle}>{label}</div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
            </div>
          )}
        </div>

        {/* Right: Vakter, Bussvakter, Oversikt */}
        {showRightPanel && (
          <div ref={rightContainerRef} style={{ position: 'relative', overflow: 'hidden' }}>
          <div
            ref={rightContentRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              transformOrigin: 'top left',
              transform: `scale(${rightScale})`,
              width: rightScale < 1 ? `${(1 / rightScale) * 100}%` : '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >

            {duties.length > 0 && (
              <div style={{ padding: '28px 36px', borderBottom: DIVIDER, flexShrink: 0 }}>
                <p style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#AAA', marginBottom: '22px' }}>
                  Vakter
                </p>
                {duties.map((duty, idx) => {
                  const hasName = duty.assigned_to && duty.assigned_to !== '-'
                  return (
                    <div key={duty.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: idx < duties.length - 1 ? '20px' : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
                        <span style={{ fontSize: '22px', fontWeight: 500, color: '#1A1A1A' }}>{duty.area}</span>
                        {duty.time_slot && <span style={{ fontSize: '20px', fontWeight: 300, color: '#888', letterSpacing: '0.02em' }}>{duty.time_slot}</span>}
                      </div>
                      <div style={{ height: '52px', minWidth: '80px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 500, letterSpacing: '0.08em', padding: '0 20px', flexShrink: 0, backgroundColor: hasName ? '#4A7C59' : '#C9785C', color: hasName ? '#ffffff' : 'rgba(255,255,255,0.9)' }}>
                        {duty.assigned_to || '–'}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {busDuties.length > 0 && (
              <div style={{ padding: '28px 36px', flexShrink: 0 }}>
                <p style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#AAA', marginBottom: '22px' }}>
                  Bussvakter
                </p>
                {busDuties.map((duty, idx) => {
                  const hasName = duty.assigned_to && duty.assigned_to !== '-'
                  return (
                    <div key={duty.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: idx < busDuties.length - 1 ? '20px' : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
                        <span style={{ fontSize: '22px', fontWeight: 500, color: '#1A1A1A' }}>{duty.direction || ''}</span>
                        {duty.time_label && <span style={{ fontSize: '20px', fontWeight: 300, color: '#888', letterSpacing: '0.02em' }}>{duty.time_label}</span>}
                      </div>
                      <div style={{ height: '52px', minWidth: '80px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 500, letterSpacing: '0.08em', padding: '0 20px', flexShrink: 0, backgroundColor: hasName ? '#4A7C59' : '#C9785C', color: hasName ? '#ffffff' : 'rgba(255,255,255,0.9)' }}>
                        {duty.assigned_to || '–'}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

          </div>
          </div>
        )}
      </div>

      {/* Footer: Info (left column) + Oversikt (right column) — aligned with body grid */}
      {(board?.info_text || hasOversikt) && (
        <footer style={{ borderTop: DIVIDER, flexShrink: 0, display: 'flex' }}>
          {/* Info — matches left column width */}
          <div style={{ flex: 1, padding: '20px 48px 20px', display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
            {board?.info_text && (
              <>
                <span style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#BBB', whiteSpace: 'nowrap' }}>Info</span>
                <span style={{ fontSize: '15px', color: '#888', fontStyle: 'italic' }}>{board.info_text}</span>
              </>
            )}
          </div>
          {/* Oversikt — matches right column width */}
          {showRightPanel && hasOversikt && (
            <div style={{ width: '375px', padding: '16px 36px 16px', borderLeft: DIVIDER, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <p style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#BBB', marginBottom: '4px' }}>Fravær</p>
                <p style={{ fontSize: '18px', fontWeight: 400, color: '#1A1A1A' }}>
                  {[
                    ...absences.filter((a) => a.is_absent !== false).map((a) => a.teacher_initials),
                    ...(board?.extra_absent ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
                  ].join(', ') || '–'}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#BBB', marginBottom: '4px' }}>Deler av dag</p>
                <p style={{ fontSize: '18px', fontWeight: 400, color: '#1A1A1A' }}>
                  {[
                    ...absences.filter((a) => a.is_absent === false).map((a) => a.teacher_initials),
                    ...(board?.extra_partial_day ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
                  ].join(', ') || '–'}
                </p>
              </div>
            </div>
          )}
        </footer>
      )}

    </div>
  )
}
