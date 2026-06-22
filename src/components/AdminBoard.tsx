'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatNorwegianDate, addDays, todayISO } from '@/lib/date'
import type { Board, Absence, Substitution, BoardDuty, BoardBusDuty, DutyArea, BusTime } from '@/lib/supabase/types'
import SettingsModal from './SettingsModal'

interface Props {
  initialBoard: Board | null
  initialAbsences: Absence[]
  initialSubstitutions: Substitution[]
  initialDuties: BoardDuty[]
  initialBusDuties: BoardBusDuty[]
  initialDutyAreas: DutyArea[]
  initialBusTimes: BusTime[]
  date: string
}

type SaveStatus = 'idle' | 'saving' | 'saved'

function sanitizeTime(value: string): string {
  return value.replace(/[^\d:]/g, '').slice(0, 5)
}

export default function AdminBoard({
  initialBoard,
  initialAbsences,
  initialSubstitutions,
  initialDuties,
  initialBusDuties,
  initialDutyAreas,
  initialBusTimes,
  date,
}: Props) {
  const [board, setBoard] = useState<Board | null>(initialBoard)
  const boardRef = useRef<Board | null>(initialBoard)

  const [absences, setAbsences] = useState<Absence[]>(initialAbsences)
  const [cellValues, setCellValues] = useState<Map<string, string>>(() => {
    const map = new Map<string, string>()
    initialSubstitutions.forEach((s) =>
      map.set(`${s.absence_id}-${s.period_number}`, s.substitute_text)
    )
    return map
  })
  const subIdsRef = useRef<Map<string, string>>((() => {
    const map = new Map<string, string>()
    initialSubstitutions.forEach((s) =>
      map.set(`${s.absence_id}-${s.period_number}`, s.id)
    )
    return map
  })())

  const [duties, setDuties] = useState<BoardDuty[]>(initialDuties)
  const [busDuties, setBusDuties] = useState<BoardBusDuty[]>(initialBusDuties)
  const [dutyAreas, setDutyAreas] = useState<DutyArea[]>(initialDutyAreas)
  const [busTimes, setBusTimes] = useState<BusTime[]>(initialBusTimes)

  const [draftInitials, setDraftInitials] = useState('')
  const [draftDutyArea, setDraftDutyArea] = useState('')
  const [draftBusDutyTime, setDraftBusDutyTime] = useState('')
  const [draftAbsent, setDraftAbsent] = useState('')
  const [draftPartial, setDraftPartial] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [editingInitialsId, setEditingInitialsId] = useState<string | null>(null)
  const [editingInitialsValue, setEditingInitialsValue] = useState('')
  const [focusedCell, setFocusedCell] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  const router = useRouter()
  const supabase = createClient()
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debounceSubRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const debounceFieldRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const debounceInfoRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const focusFirstCellRef = useRef<string | null>(null)

  useEffect(() => {
    if (focusFirstCellRef.current) {
      const input = document.querySelector<HTMLInputElement>(
        `input[data-cell="${focusFirstCellRef.current}-1"]`
      )
      if (input) {
        input.focus()
        focusFirstCellRef.current = null
      }
    }
  })

  function markSaved() {
    setSaveStatus('saved')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000)
  }

  async function ensureBoard(): Promise<Board> {
    if (boardRef.current) return boardRef.current
    const { data, error } = await supabase
      .from('boards')
      .insert({ date, num_periods: 6, info_text: '', extra_absent: '', extra_partial_day: '' })
      .select().single()
    if (error || !data) throw new Error('Kunne ikke opprette tavle')
    boardRef.current = data as Board
    setBoard(data as Board)
    return data as Board
  }

  // ── Absences ──────────────────────────────────────────────────

  async function submitDraft(): Promise<Absence | null> {
    const initials = draftInitials.trim()
    if (!initials) return null
    const currentBoard = await ensureBoard()
    const maxOrder = absences.reduce((m, a) => Math.max(m, a.sort_order), -1)
    const { data, error } = await supabase
      .from('absences')
      .insert({ board_id: currentBoard.id, teacher_initials: initials, sort_order: maxOrder + 1, num_periods: 6 })
      .select().single()
    if (error || !data) return null
    const newAbsence = data as Absence
    setAbsences((prev) => [...prev, newAbsence])
    setDraftInitials('')
    markSaved()
    return newAbsence
  }

  async function toggleAbsent(absence: Absence) {
    const next = !absence.is_absent
    setAbsences((prev) => prev.map((a) => (a.id === absence.id ? { ...a, is_absent: next } : a)))
    await supabase.from('absences').update({ is_absent: next }).eq('id', absence.id)
    markSaved()
  }

  async function deleteAbsence(absenceId: string) {
    if (!confirm('Slett denne fraværsraden?')) return
    await supabase.from('absences').delete().eq('id', absenceId)
    setAbsences((prev) => prev.filter((a) => a.id !== absenceId))
    markSaved()
  }

  async function saveInitials(absence: Absence) {
    const trimmed = editingInitialsValue.trim()
    if (!trimmed || trimmed === absence.teacher_initials) {
      setEditingInitialsId(null)
      return
    }
    const { data } = await supabase
      .from('absences').update({ teacher_initials: trimmed }).eq('id', absence.id).select().single()
    if (data) setAbsences((prev) => prev.map((a) => (a.id === absence.id ? (data as Absence) : a)))
    setEditingInitialsId(null)
    markSaved()
  }

  async function changeAbsencePeriods(absence: Absence, delta: number) {
    const current = absence.num_periods
    const next = Math.max(1, current + delta)
    if (next === current) return

    if (delta < 0) {
      if (!confirm(`Fjerne Time ${current} for ${absence.teacher_initials}? Data for denne timen slettes.`)) return
      const subKey = `${absence.id}-${current}`
      const subId = subIdsRef.current.get(subKey)
      if (subId) {
        await supabase.from('substitutions').delete().eq('id', subId)
        subIdsRef.current.delete(subKey)
        setCellValues((prev) => {
          const m = new Map(prev)
          m.delete(subKey)
          return m
        })
      }
    }

    const { data } = await supabase
      .from('absences').update({ num_periods: next }).eq('id', absence.id).select().single()
    if (data) setAbsences((prev) => prev.map((a) => (a.id === absence.id ? (data as Absence) : a)))
    markSaved()
  }

  // ── Substitutions ─────────────────────────────────────────────

  async function saveSubstitution(absenceId: string, period: number, text: string) {
    const key = `${absenceId}-${period}`
    const existingId = subIdsRef.current.get(key)
    setSaveStatus('saving')
    if (existingId) {
      await supabase.from('substitutions').update({ substitute_text: text }).eq('id', existingId)
    } else {
      const { data } = await supabase
        .from('substitutions')
        .insert({ absence_id: absenceId, period_number: period, substitute_text: text })
        .select().single()
      if (data) subIdsRef.current.set(key, (data as Substitution).id)
    }
    markSaved()
  }

  function handleCellChange(absenceId: string, period: number, value: string) {
    const upper = value.toUpperCase()
    const key = `${absenceId}-${period}`
    setCellValues((prev) => new Map(prev).set(key, upper))
    const existing = debounceSubRefs.current.get(key)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => saveSubstitution(absenceId, period, upper), 600)
    debounceSubRefs.current.set(key, timer)
  }

  // ── Duties (Vakter) ───────────────────────────────────────────

  async function addDuty() {
    const currentBoard = await ensureBoard()
    const maxOrder = duties.reduce((m, d) => Math.max(m, d.sort_order), -1)
    const { data, error } = await supabase
      .from('board_duties')
      .insert({ board_id: currentBoard.id, area: '', time_slot: '', sort_order: maxOrder + 1 })
      .select().single()
    if (error || !data) return
    setDuties((prev) => [...prev, data as BoardDuty])
    markSaved()
  }

  async function submitDraftDuty() {
    const area = draftDutyArea.trim()
    if (!area) return
    const currentBoard = await ensureBoard()
    const maxOrder = duties.reduce((m, d) => Math.max(m, d.sort_order), -1)
    const { data, error } = await supabase
      .from('board_duties')
      .insert({ board_id: currentBoard.id, area, time_slot: '', assigned_to: '', sort_order: maxOrder + 1 })
      .select().single()
    if (error || !data) return
    setDuties((prev) => [...prev, data as BoardDuty])
    setDraftDutyArea('')
    markSaved()
  }

  async function deleteDuty(id: string) {
    await supabase.from('board_duties').delete().eq('id', id)
    setDuties((prev) => prev.filter((d) => d.id !== id))
    markSaved()
  }

  function handleDutyField(id: string, field: 'area' | 'time_slot' | 'assigned_to', value: string) {
    const upper = field === 'assigned_to' ? value.toUpperCase() : value
    setDuties((prev) => prev.map((d) => (d.id === id ? { ...d, [field]: upper } : d)))
    const key = `duty-${id}-${field}`
    const existing = debounceFieldRefs.current.get(key)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(async () => {
      setSaveStatus('saving')
      await supabase.from('board_duties').update({ [field]: upper }).eq('id', id)
      markSaved()
    }, 600)
    debounceFieldRefs.current.set(key, timer)
  }

  // ── Bus duties (Bussvakter) ───────────────────────────────────

  async function addBusDuty() {
    const currentBoard = await ensureBoard()
    const maxOrder = busDuties.reduce((m, d) => Math.max(m, d.sort_order), -1)
    const { data, error } = await supabase
      .from('board_bus_duties')
      .insert({ board_id: currentBoard.id, time_label: '', sort_order: maxOrder + 1 })
      .select().single()
    if (error || !data) return
    setBusDuties((prev) => [...prev, data as BoardBusDuty])
    markSaved()
  }

  async function submitDraftBusDuty() {
    const time_label = draftBusDutyTime.trim()
    if (!time_label) return
    const currentBoard = await ensureBoard()
    const maxOrder = busDuties.reduce((m, d) => Math.max(m, d.sort_order), -1)
    const { data, error } = await supabase
      .from('board_bus_duties')
      .insert({ board_id: currentBoard.id, time_label, direction: '', assigned_to: '', sort_order: maxOrder + 1 })
      .select().single()
    if (error || !data) return
    setBusDuties((prev) => [...prev, data as BoardBusDuty])
    setDraftBusDutyTime('')
    markSaved()
  }

  async function deleteBusDuty(id: string) {
    await supabase.from('board_bus_duties').delete().eq('id', id)
    setBusDuties((prev) => prev.filter((d) => d.id !== id))
    markSaved()
  }

  function handleBusDutyField(id: string, field: 'time_label' | 'direction' | 'assigned_to', value: string) {
    const upper = field === 'assigned_to' ? value.toUpperCase() : value
    setBusDuties((prev) => prev.map((d) => (d.id === id ? { ...d, [field]: upper } : d)))
    const key = `busduty-${id}-${field}`
    const existing = debounceFieldRefs.current.get(key)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(async () => {
      setSaveStatus('saving')
      await supabase.from('board_bus_duties').update({ [field]: upper }).eq('id', id)
      markSaved()
    }, 600)
    debounceFieldRefs.current.set(key, timer)
  }

  // ── Info text & extra lists ───────────────────────────────────

  function handleInfoTextChange(value: string) {
    setBoard((prev) => (prev ? { ...prev, info_text: value } : prev))
    if (debounceInfoRef.current) clearTimeout(debounceInfoRef.current)
    debounceInfoRef.current = setTimeout(async () => {
      setSaveStatus('saving')
      const currentBoard = boardRef.current
      if (!currentBoard) return
      await supabase.from('boards').update({ info_text: value }).eq('id', currentBoard.id)
      markSaved()
    }, 600)
  }

  function handleBoardField(field: 'extra_absent' | 'extra_partial_day', value: string) {
    setBoard((prev) => (prev ? { ...prev, [field]: value } : prev))
    const existing = debounceFieldRefs.current.get(field)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(async () => {
      setSaveStatus('saving')
      const currentBoard = boardRef.current
      if (!currentBoard) return
      await supabase.from('boards').update({ [field]: value }).eq('id', currentBoard.id)
      markSaved()
    }, 600)
    debounceFieldRefs.current.set(field, timer)
  }

  function getExtraNames(field: 'extra_absent' | 'extra_partial_day'): string[] {
    return (board?.[field] ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
  }

  function submitDraftAbsent() {
    const name = draftAbsent.trim().toUpperCase()
    if (!name) return
    handleBoardField('extra_absent', [...getExtraNames('extra_absent'), name].join('\n'))
    setDraftAbsent('')
  }

  function removeExtraName(field: 'extra_absent' | 'extra_partial_day', idx: number) {
    const next = getExtraNames(field).filter((_, i) => i !== idx)
    handleBoardField(field, next.join('\n'))
  }

  function submitDraftPartial() {
    const name = draftPartial.trim().toUpperCase()
    if (!name) return
    handleBoardField('extra_partial_day', [...getExtraNames('extra_partial_day'), name].join('\n'))
    setDraftPartial('')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  function navigateDate(direction: number) {
    router.push(`/admin?date=${addDays(date, direction)}`)
  }

  const today = todayISO()

  // Compute max periods across all absence rows
  const maxPeriods = absences.length > 0
    ? Math.max(...absences.map((a) => a.num_periods ?? 6))
    : 6

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-slate-800 text-white px-6 py-4 shadow-lg">
        <div className="max-w-full mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <button onClick={() => navigateDate(-1)} className="bg-slate-600 hover:bg-slate-500 text-white px-3 py-1.5 rounded-lg text-sm transition-colors">
              ←<span className="hidden sm:inline"> Forrige</span>
            </button>
            <div>
              <h1 className="text-base sm:text-xl font-bold capitalize">{formatNorwegianDate(date)}</h1>
              {date !== today && (
                <button onClick={() => router.push('/admin')} className="text-slate-400 hover:text-slate-200 text-xs underline">
                  Gå til i dag
                </button>
              )}
            </div>
            <button onClick={() => navigateDate(1)} className="bg-slate-600 hover:bg-slate-500 text-white px-3 py-1.5 rounded-lg text-sm transition-colors">
              <span className="hidden sm:inline">Neste </span>→
            </button>
          </div>
          <div className="flex items-center gap-3">
            {saveStatus === 'saved' && <span className="text-green-400 text-sm">✓ Lagret</span>}
            {saveStatus === 'saving' && <span className="text-slate-400 text-sm">Lagrer...</span>}
            <button onClick={() => setShowSettings(true)} className="bg-slate-600 hover:bg-slate-500 text-white px-3 py-1.5 rounded-lg text-sm transition-colors" title="Innstillinger">
              ⚙<span className="hidden sm:inline"> Innstillinger</span>
            </button>
            <a href="/" target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-white text-sm underline hidden sm:inline">
              Se visning
            </a>
            <button onClick={handleLogout} className="bg-slate-600 hover:bg-slate-500 text-white px-3 py-1.5 rounded-lg text-sm transition-colors">
              <span className="hidden sm:inline">Logg </span>ut
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 flex flex-col gap-4">
        {/* Main area: absences (2/3) + duties (1/3) */}
        <div className="flex flex-col md:flex-row gap-4 items-start">
          {/* Left: Absences table */}
          <div className="flex-[2] min-w-0">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-700 text-white">
                      <th className="px-2 py-3 font-semibold text-sm text-center w-16">Fravær</th>
                      <th className="text-left px-3 py-3 font-semibold text-sm w-28">Lærer</th>
                      {Array.from({ length: maxPeriods }, (_, i) => i + 1).map((p) => (
                        <th key={p} className="px-2 py-3 font-semibold text-center text-sm min-w-[72px]">
                          {p}. time
                        </th>
                      ))}
                      <th className="px-2 py-3 w-16 text-center text-xs text-slate-400 font-normal">Timer</th>
                      <th className="px-2 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {absences.map((absence) => {
                        const rowPeriods = absence.num_periods ?? 6
                        return (
                          <tr key={absence.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-2 py-2 border-r border-slate-100 text-center">
                              <input
                                type="checkbox"
                                checked={absence.is_absent ?? true}
                                onChange={() => toggleAbsent(absence)}
                                className="w-4 h-4 accent-slate-700 cursor-pointer"
                              />
                            </td>
                            <td className="px-3 py-2 border-r border-slate-100">
                              {editingInitialsId === absence.id ? (
                                <input
                                  autoFocus
                                  type="text"
                                  value={editingInitialsValue}
                                  onChange={(e) => setEditingInitialsValue(e.target.value.toUpperCase())}
                                  onBlur={() => saveInitials(absence)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveInitials(absence)
                                    if (e.key === 'Escape') setEditingInitialsId(null)
                                  }}
                                  className="w-full border border-slate-300 rounded px-2 py-1 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 text-sm"
                                />
                              ) : (
                                <button
                                  onClick={() => { setEditingInitialsId(absence.id); setEditingInitialsValue(absence.teacher_initials) }}
                                  className="font-bold text-slate-800 hover:underline text-left w-full text-sm"
                                >
                                  {absence.teacher_initials}
                                </button>
                              )}
                            </td>
                            {Array.from({ length: maxPeriods }, (_, i) => i + 1).map((p) => {
                              const active = p <= rowPeriods
                              const key = `${absence.id}-${p}`
                              const value = cellValues.get(key) ?? ''
                              const isFocused = focusedCell === key
                              const isDash = value === '-'
                              const wrapperStyle = !active
                                ? { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' }
                                : isFocused || isDash
                                ? { backgroundColor: '#f1f5f9', borderColor: '#94a3b8' }
                                : value
                                ? { backgroundColor: '#86efac', borderColor: '#4ade80' }
                                : { backgroundColor: '#ef4444', borderColor: '#dc2626' }
                              const inputTextClass = active && !value
                                ? 'text-white placeholder-red-200'
                                : active
                                ? 'text-slate-700 placeholder-slate-300'
                                : 'text-slate-300 placeholder-slate-200'
                              return (
                                <td key={p} className="px-1 py-2 border-r border-slate-100 last:border-r-0">
                                  <div
                                    className={`border rounded min-w-[68px] transition-colors ${!active ? 'cursor-not-allowed' : ''}`}
                                    style={wrapperStyle}
                                  >
                                    <input
                                      type="text"
                                      data-cell={`${absence.id}-${p}`}
                                      disabled={!active}
                                      value={active ? value : ''}
                                      onChange={(e) => active && handleCellChange(absence.id, p, e.target.value)}
                                      onFocus={() => setFocusedCell(key)}
                                      onBlur={() => setFocusedCell(null)}
                                      placeholder={active ? '—' : ''}
                                      className={`w-full text-center bg-transparent px-1 py-1.5 text-sm focus:outline-none ${!active ? 'cursor-not-allowed' : ''} ${inputTextClass}`}
                                    />
                                  </div>
                                </td>
                              )
                            })}
                            {/* Per-row period controls */}
                            <td className="px-2 py-2 border-r border-slate-100">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => changeAbsencePeriods(absence, -1)}
                                  disabled={(absence.num_periods ?? 6) <= 1}
                                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-red-100 hover:text-red-600 text-slate-600 disabled:opacity-30 text-lg font-bold transition-colors"
                                  title="Fjern siste time"
                                >
                                  −
                                </button>
                                <span className="text-sm font-semibold text-slate-600 w-5 text-center">{absence.num_periods ?? 6}</span>
                                <button
                                  onClick={() => changeAbsencePeriods(absence, 1)}
                                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-green-100 hover:text-green-700 text-slate-600 text-lg font-bold transition-colors"
                                  title="Legg til time"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-center">
                              <button
                                onClick={() => deleteAbsence(absence.id)}
                                className="text-slate-300 hover:text-red-500 transition-colors"
                                title="Slett rad"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        )
                    })}
                    {/* Draft row — grayed out, not saved to DB until blur/Enter */}
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-2 py-2 border-r border-slate-100" />
                      <td className="px-3 py-2 border-r border-slate-100">
                        <input
                          type="text"
                          value={draftInitials}
                          onChange={(e) => setDraftInitials(e.target.value.toUpperCase())}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') submitDraft()
                            if (e.key === 'Tab') {
                              e.preventDefault()
                              const newAbsence = await submitDraft()
                              if (newAbsence) focusFirstCellRef.current = newAbsence.id
                            }
                          }}
                          onBlur={submitDraft}
                          placeholder="Legg til…"
                          className="w-full font-bold text-slate-500 placeholder-slate-300 focus:outline-none focus:placeholder-slate-400 bg-transparent text-sm"
                        />
                      </td>
                      {Array.from({ length: maxPeriods }, (_, i) => i + 1).map((p) => (
                        <td key={p} className="px-1 py-2 border-r border-slate-100 last:border-r-0">
                          <div
                            className="border rounded min-w-[68px]"
                            style={{ backgroundColor: '#f8fafc', borderColor: '#f1f5f9', height: '34px' }}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-2 border-r border-slate-100" />
                      <td className="px-2 py-2" />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right: Duties (1/3) */}
          <div className="flex-[1] min-w-0 flex flex-row gap-3">
            {/* Vakter */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
              <div className="bg-slate-700 text-white px-3 py-3 font-semibold text-sm text-center">
                Vakter
              </div>
              <div className="flex-1 divide-y divide-slate-100">
                {duties.map((duty) => {
                  const assignedStyle = duty.assigned_to === '-'
                    ? { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1', color: '#64748b' }
                    : duty.assigned_to
                    ? { backgroundColor: '#86efac', borderColor: '#4ade80', color: '#14532d' }
                    : { backgroundColor: '#ef4444', borderColor: '#dc2626', color: '#ffffff' }
                  return (
                    <div key={duty.id} className="flex gap-1 p-2 items-center">
                      <input
                        list="duty-areas-list"
                        value={duty.area}
                        onChange={(e) => handleDutyField(duty.id, 'area', e.target.value)}
                        placeholder="Sted"
                        className="w-16 flex-shrink-0 border border-slate-200 rounded px-2 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
                      />
                      <input
                        type="text"
                        value={duty.time_slot}
                        onChange={(e) => handleDutyField(duty.id, 'time_slot', sanitizeTime(e.target.value))}
                        placeholder="Tid"
                        className="w-14 flex-shrink-0 border border-slate-200 rounded px-2 py-2.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-slate-400"
                      />
                      <div className="border rounded flex-1 min-w-0" style={assignedStyle}>
                        <input
                          type="text"
                          value={duty.assigned_to}
                          onChange={(e) => handleDutyField(duty.id, 'assigned_to', e.target.value)}
                          placeholder="–"
                          className="w-full bg-transparent px-2 py-2.5 text-sm text-center focus:outline-none"
                          style={{ color: assignedStyle.color }}
                        />
                      </div>
                      <button
                        onClick={() => deleteDuty(duty.id)}
                        className="p-2 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
                <datalist id="duty-areas-list">
                  {dutyAreas.map((a) => <option key={a.id} value={a.name} />)}
                </datalist>
              </div>
              {/* Draft row */}
              <div className="flex gap-1 p-2 items-center border-t border-slate-100">
                <input
                  list="duty-areas-list"
                  value={draftDutyArea}
                  onChange={(e) => setDraftDutyArea(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitDraftDuty() }}
                  onBlur={submitDraftDuty}
                  placeholder="Legg til…"
                  className="w-16 flex-shrink-0 border border-slate-200 rounded px-2 py-2.5 text-sm text-slate-500 placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 bg-transparent"
                />
                <div className="border rounded flex-1 min-w-0" style={{ backgroundColor: '#f8fafc', borderColor: '#f1f5f9', height: '38px' }} />
                <div className="w-5 flex-shrink-0" />
              </div>
            </div>

            {/* Bussvakter */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
              <div className="bg-slate-700 text-white px-3 py-3 font-semibold text-sm text-center">
                Bussvakter
              </div>
              <div className="flex-1 divide-y divide-slate-100">
                {busDuties.map((duty) => {
                  const assignedStyle = duty.assigned_to === '-'
                    ? { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1', color: '#64748b' }
                    : duty.assigned_to
                    ? { backgroundColor: '#86efac', borderColor: '#4ade80', color: '#14532d' }
                    : { backgroundColor: '#ef4444', borderColor: '#dc2626', color: '#ffffff' }
                  return (
                    <div key={duty.id} className="flex gap-1 p-2 items-center">
                      <select
                        value={duty.direction}
                        onChange={(e) => handleBusDutyField(duty.id, 'direction', e.target.value)}
                        className="w-20 flex-shrink-0 border border-slate-200 rounded px-2 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white"
                      >
                        <option value="">Retning</option>
                        <option value="Ålesund">Ålesund</option>
                        <option value="Skodje">Skodje</option>
                      </select>
                      <input
                        list="bus-times-list"
                        value={duty.time_label}
                        onChange={(e) => handleBusDutyField(duty.id, 'time_label', sanitizeTime(e.target.value))}
                        placeholder="Tid"
                        className="w-20 flex-shrink-0 border border-slate-200 rounded px-2 py-2.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-slate-400"
                      />
                      {/* Colored assigned_to input */}
                      <div className="border rounded flex-1 min-w-0" style={assignedStyle}>
                        <input
                          type="text"
                          value={duty.assigned_to}
                          onChange={(e) => handleBusDutyField(duty.id, 'assigned_to', e.target.value)}
                          placeholder="–"
                          className="w-full bg-transparent px-2 py-2.5 text-sm text-center focus:outline-none"
                          style={{ color: assignedStyle.color }}
                        />
                      </div>
                      <button
                        onClick={() => deleteBusDuty(duty.id)}
                        className="p-2 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
                <datalist id="bus-times-list">
                  {busTimes.map((t) => <option key={t.id} value={t.time_label} />)}
                </datalist>
              </div>
              {/* Draft row */}
              <div className="flex gap-1 p-2 items-center border-t border-slate-100">
                <input
                  list="bus-times-list"
                  value={draftBusDutyTime}
                  onChange={(e) => setDraftBusDutyTime(sanitizeTime(e.target.value))}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitDraftBusDuty() }}
                  onBlur={submitDraftBusDuty}
                  placeholder="Legg til…"
                  className="w-20 flex-shrink-0 border border-slate-200 rounded px-2 py-2.5 text-sm text-center text-slate-500 placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 bg-transparent"
                />
                <div className="border rounded flex-1 min-w-0" style={{ backgroundColor: '#f8fafc', borderColor: '#f1f5f9', height: '38px' }} />
                <div className="w-5 flex-shrink-0" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom section: info + absence lists */}
        <div className="flex flex-col md:flex-row gap-4">
          {/* Info text: 2/3 */}
          <div className="flex-[2] bg-white rounded-xl border border-slate-200 p-4">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
              Informasjon til personalet
            </label>
            <textarea
              rows={3}
              value={board?.info_text ?? ''}
              onChange={(e) => handleInfoTextChange(e.target.value)}
              placeholder="Skriv generell informasjon her..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
            />
          </div>

          {/* Fravær & Deler av dag: 1/3 */}
          <div className="flex-[1] bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col divide-y divide-slate-100">
            {/* Fravær */}
            <div className="flex-1 flex flex-col">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Fravær</span>
                {absences.filter((a) => a.is_absent !== false).length > 0 && (
                  <span className="ml-2 text-xs text-slate-400">
                    {absences.filter((a) => a.is_absent !== false).map((a) => a.teacher_initials).join(', ')}
                  </span>
                )}
              </div>
              <div className="divide-y divide-slate-50">
                {getExtraNames('extra_absent').map((name, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-3 py-1.5">
                    <span className="flex-1 text-sm font-semibold text-slate-700">{name}</span>
                    <button
                      onClick={() => removeExtraName('extra_absent', idx)}
                      className="text-slate-300 hover:text-red-500 transition-colors text-sm"
                    >✕</button>
                  </div>
                ))}
                <div className="px-3 py-1.5">
                  <input
                    type="text"
                    value={draftAbsent}
                    onChange={(e) => setDraftAbsent(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitDraftAbsent() }}
                    onBlur={submitDraftAbsent}
                    placeholder="Legg til…"
                    className="w-full text-sm text-slate-500 placeholder-slate-300 focus:outline-none bg-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Deler av dag */}
            <div className="flex-1 flex flex-col">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Deler av dag</span>
                {absences.filter((a) => a.is_absent === false).length > 0 && (
                  <span className="ml-2 text-xs text-slate-400">
                    {absences.filter((a) => a.is_absent === false).map((a) => a.teacher_initials).join(', ')}
                  </span>
                )}
              </div>
              <div className="divide-y divide-slate-50">
                {getExtraNames('extra_partial_day').map((name, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-3 py-1.5">
                    <span className="flex-1 text-sm font-semibold text-slate-700">{name}</span>
                    <button
                      onClick={() => removeExtraName('extra_partial_day', idx)}
                      className="text-slate-300 hover:text-red-500 transition-colors text-sm"
                    >✕</button>
                  </div>
                ))}
                <div className="px-3 py-1.5">
                  <input
                    type="text"
                    value={draftPartial}
                    onChange={(e) => setDraftPartial(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitDraftPartial() }}
                    onBlur={submitDraftPartial}
                    placeholder="Legg til…"
                    className="w-full text-sm text-slate-500 placeholder-slate-300 focus:outline-none bg-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {showSettings && (
        <SettingsModal
          dutyAreas={dutyAreas}
          busTimes={busTimes}
          onUpdate={(areas, times) => { setDutyAreas(areas); setBusTimes(times) }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
