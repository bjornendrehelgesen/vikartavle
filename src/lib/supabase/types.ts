export type Board = {
  id: string
  date: string
  info_text: string
  num_periods: number
  extra_absent: string
  extra_partial_day: string
  created_at: string
}

export type Absence = {
  id: string
  board_id: string
  teacher_initials: string
  sort_order: number
  num_periods: number
  is_absent: boolean
  created_at: string
}

export type Substitution = {
  id: string
  absence_id: string
  period_number: number
  substitute_text: string
}

export type DutyArea = {
  id: string
  name: string
  sort_order: number
}

export type BusTime = {
  id: string
  time_label: string
  sort_order: number
}

export type BoardDuty = {
  id: string
  board_id: string
  area: string
  time_slot: string
  assigned_to: string
  sort_order: number
  created_at: string
}

export type BoardBusDuty = {
  id: string
  board_id: string
  time_label: string
  direction: string
  assigned_to: string
  sort_order: number
  created_at: string
}
