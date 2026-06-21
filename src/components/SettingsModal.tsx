'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { DutyArea, BusTime } from '@/lib/supabase/types'

interface Props {
  dutyAreas: DutyArea[]
  busTimes: BusTime[]
  onUpdate: (areas: DutyArea[], times: BusTime[]) => void
  onClose: () => void
}

type ActiveTab = 'vaktsteder' | 'busstider'

export default function SettingsModal({ dutyAreas, busTimes, onUpdate, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('vaktsteder')
  const [areas, setAreas] = useState<DutyArea[]>(dutyAreas)
  const [times, setTimes] = useState<BusTime[]>(busTimes)
  const [newArea, setNewArea] = useState('')
  const [newTime, setNewTime] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const supabase = createClient()

  async function addArea() {
    const name = newArea.trim()
    if (!name) return
    const maxOrder = areas.reduce((m, a) => Math.max(m, a.sort_order), -1)
    const { data } = await supabase
      .from('duty_areas').insert({ name, sort_order: maxOrder + 1 }).select().single()
    if (data) {
      const next = [...areas, data as DutyArea]
      setAreas(next)
      onUpdate(next, times)
    }
    setNewArea('')
  }

  async function updateArea(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    setSavingId(id)
    await supabase.from('duty_areas').update({ name: trimmed }).eq('id', id)
    const next = areas.map((a) => (a.id === id ? { ...a, name: trimmed } : a))
    setAreas(next)
    onUpdate(next, times)
    setSavingId(null)
  }

  async function deleteArea(id: string) {
    await supabase.from('duty_areas').delete().eq('id', id)
    const next = areas.filter((a) => a.id !== id)
    setAreas(next)
    onUpdate(next, times)
  }

  async function addTime() {
    const label = newTime.trim()
    if (!label) return
    const maxOrder = times.reduce((m, t) => Math.max(m, t.sort_order), -1)
    const { data } = await supabase
      .from('bus_times').insert({ time_label: label, sort_order: maxOrder + 1 }).select().single()
    if (data) {
      const next = [...times, data as BusTime]
      setTimes(next)
      onUpdate(areas, next)
    }
    setNewTime('')
  }

  async function updateTime(id: string, time_label: string) {
    const trimmed = time_label.trim()
    if (!trimmed) return
    setSavingId(id)
    await supabase.from('bus_times').update({ time_label: trimmed }).eq('id', id)
    const next = times.map((t) => (t.id === id ? { ...t, time_label: trimmed } : t))
    setTimes(next)
    onUpdate(areas, next)
    setSavingId(null)
  }

  async function deleteTime(id: string) {
    await supabase.from('bus_times').delete().eq('id', id)
    const next = times.filter((t) => t.id !== id)
    setTimes(next)
    onUpdate(areas, next)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-lg font-bold text-slate-800">Innstillinger</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 flex-shrink-0">
          <button
            onClick={() => setActiveTab('vaktsteder')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${
              activeTab === 'vaktsteder'
                ? 'border-b-2 border-slate-700 text-slate-800'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Vaktsteder
          </button>
          <button
            onClick={() => setActiveTab('busstider')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${
              activeTab === 'busstider'
                ? 'border-b-2 border-slate-700 text-slate-800'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Busstider
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-6">
          {activeTab === 'vaktsteder' && (
            <div className="space-y-2">
              {areas.length === 0 && (
                <p className="text-slate-400 text-sm py-2">Ingen vaktsteder lagt til ennå.</p>
              )}
              {areas.map((area) => (
                <div key={area.id} className="flex items-center gap-2">
                  <input
                    defaultValue={area.name}
                    onBlur={(e) => {
                      if (e.target.value.trim() !== area.name) updateArea(area.id, e.target.value)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                    }}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 bg-slate-50 focus:bg-white transition-colors"
                  />
                  {savingId === area.id && (
                    <span className="text-xs text-slate-400 flex-shrink-0">Lagrer...</span>
                  )}
                  <button
                    onClick={() => deleteArea(area.id)}
                    className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0 text-lg leading-none"
                    title="Slett"
                  >
                    ✕
                  </button>
                </div>
              ))}

              <div className="flex gap-2 pt-2">
                <input
                  value={newArea}
                  onChange={(e) => setNewArea(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addArea()}
                  placeholder="Nytt vaktsted (f.eks. Kantine)"
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                <button
                  onClick={addArea}
                  disabled={!newArea.trim()}
                  className="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  Legg til
                </button>
              </div>
            </div>
          )}

          {activeTab === 'busstider' && (
            <div className="space-y-2">
              {times.length === 0 && (
                <p className="text-slate-400 text-sm py-2">Ingen busstider lagt til ennå.</p>
              )}
              {times.map((time) => (
                <div key={time.id} className="flex items-center gap-2">
                  <input
                    defaultValue={time.time_label}
                    onBlur={(e) => {
                      if (e.target.value.trim() !== time.time_label) updateTime(time.id, e.target.value)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                    }}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 bg-slate-50 focus:bg-white transition-colors"
                  />
                  {savingId === time.id && (
                    <span className="text-xs text-slate-400 flex-shrink-0">Lagrer...</span>
                  )}
                  <button
                    onClick={() => deleteTime(time.id)}
                    className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0 text-lg leading-none"
                    title="Slett"
                  >
                    ✕
                  </button>
                </div>
              ))}

              <div className="flex gap-2 pt-2">
                <input
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTime()}
                  placeholder="Ny busstid (f.eks. 07:45)"
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                <button

                  onClick={addTime}
                  disabled={!newTime.trim()}
                  className="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  Legg til
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
