import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App.jsx'
import CalendarPanel from './CalendarPanel.jsx'
import { TASK_STORAGE_KEY } from '../../hooks/useTasks.js'
import { formatDate, getCalendarDays, getTasksForDate, shiftCalendarMonth, todayDateValue } from '../../utils/tasks.js'

beforeEach(() => {
  window.localStorage.clear()
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open') }
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

function task(id, dueDate) {
  return {
    id,
    title: `Task ${id}`,
    description: '',
    priority: 'Medium',
    status: 'To Do',
    dueDate,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  }
}

function seedTasks(tasks) {
  window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify({ version: 1, tasks }))
}

describe('calendar date utilities', () => {
  it('navigates months across year boundaries in both directions', () => {
    expect(shiftCalendarMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 })
    expect(shiftCalendarMonth(2027, 0, -1)).toEqual({ year: 2026, month: 11 })
  })

  it('generates leap-year February with the correct local calendar days', () => {
    const days = getCalendarDays(2024, 1)
    const inFebruary = days.filter((date) => date.inMonth)
    expect(inFebruary).toHaveLength(29)
    expect(inFebruary[0].dateValue).toBe('2024-02-01')
    expect(inFebruary.at(-1).dateValue).toBe('2024-02-29')
    expect(days.length % 7).toBe(0)
  })

  it('keeps date-only display on the same calendar date in distant time zones', () => {
    const nodeEnvironment = globalThis.process.env
    const originalZone = nodeEnvironment.TZ
    try {
      for (const zone of ['Pacific/Kiritimati', 'America/Los_Angeles']) {
        nodeEnvironment.TZ = zone
        const parts = new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }).formatToParts(new Date('2026-01-01T12:00:00'))
        expect(formatDate('2026-01-01', { month: 'short', day: 'numeric', year: 'numeric' })).toBe(parts.map((part) => part.value).join(''))
      }
    } finally {
      if (originalZone === undefined) delete nodeEnvironment.TZ
      else nodeEnvironment.TZ = originalZone
    }
  })

  it('filters only exact due-date tasks and ignores tasks without a due date', () => {
    const selected = '2026-10-31'
    expect(getTasksForDate([
      task('same-day', selected),
      task('other-day', '2026-11-01'),
      task('undated', ''),
    ], selected).map((item) => item.id)).toEqual(['same-day'])
  })
})

describe('interactive calendar component', () => {
  it('marks task dates and distinguishes today from the selected date', async () => {
    const user = userEvent.setup()
    const today = todayDateValue()
    const [year, month] = today.split('-').map(Number)
    const onDateSelect = (dateValue) => view.rerender(<CalendarPanel year={year} month={month - 1} tasks={[task('today-task', today)]} selectedDate={dateValue} onMonthChange={() => {}} onDateSelect={onDateSelect} />)
    const view = render(<CalendarPanel year={year} month={month - 1} tasks={[task('today-task', today), task('undated', '')]} selectedDate="" onMonthChange={() => {}} onDateSelect={onDateSelect} />)
    const todayCell = view.container.querySelector(`[data-date="${today}"]`)
    expect(todayCell.classList.contains('today')).toBe(true)
    expect(todayCell.classList.contains('has-event')).toBe(true)
    expect(todayCell.classList.contains('selected')).toBe(false)

    await user.click(todayCell)
    expect(todayCell.classList.contains('today')).toBe(true)
    expect(todayCell.classList.contains('has-event')).toBe(true)
    expect(todayCell.classList.contains('selected')).toBe(true)
    expect(todayCell.getAttribute('aria-pressed')).toBe('true')
    expect(view.container.querySelectorAll('.calendar-date.has-event')).toHaveLength(1)

    const anotherDay = view.container.querySelector(`.calendar-date[data-date]:not([data-date="${today}"])`)
    await user.click(anotherDay)
    expect(todayCell.classList.contains('today')).toBe(true)
    expect(todayCell.classList.contains('selected')).toBe(false)
    expect(anotherDay.classList.contains('selected')).toBe(true)
  })

  it('navigates the visible month and selects dates with keyboard-operable buttons', async () => {
    const user = userEvent.setup()
    const onMonthChange = vi.fn()
    const onDateSelect = vi.fn()
    render(<CalendarPanel year={2026} month={11} tasks={[]} selectedDate="" onMonthChange={onMonthChange} onDateSelect={onDateSelect} />)
    expect(screen.getByRole('heading', { name: 'December 2026' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(onMonthChange).toHaveBeenCalledWith(1)
  })

  it('selects a date with Enter and reports a month with no due tasks', async () => {
    const user = userEvent.setup()
    const today = todayDateValue()
    const [year, month] = today.split('-').map(Number)
    const onDateSelect = vi.fn()
    const { container } = render(<CalendarPanel year={year} month={month - 1} tasks={[]} selectedDate="" onMonthChange={() => {}} onDateSelect={onDateSelect} />)
    const dateButton = container.querySelector('.calendar-date')
    dateButton.focus()
    await user.keyboard('{Enter}')
    expect(onDateSelect).toHaveBeenCalledOnce()
    expect(screen.getByText('No tasks due this month.')).toBeTruthy()
  })
})

describe('calendar task workflow', () => {
  it('navigates the dashboard through December into the next January', async () => {
    const user = userEvent.setup()
    seedTasks([])
    render(<App />)
    const next = screen.getByRole('button', { name: 'Next month' })
    const currentMonth = new Date().getMonth()
    const year = new Date().getFullYear()
    for (let month = currentMonth; month < 11; month += 1) await user.click(next)
    expect(screen.getByRole('heading', { name: `December ${year}` })).toBeTruthy()
    await user.click(next)
    expect(screen.getByRole('heading', { name: `January ${year + 1}` })).toBeTruthy()
  })

  it('shows only tasks due on the selected date, allows clear, and prefills a new task date', async () => {
    const user = userEvent.setup()
    const today = todayDateValue()
    const tomorrowDate = new Date(`${today}T12:00:00`)
    tomorrowDate.setDate(tomorrowDate.getDate() + 1)
    const tomorrow = todayDateValue(tomorrowDate)
    seedTasks([task('selected', today), task('other', tomorrow), task('undated', '')])

    render(<App />)
    const calendar = document.querySelector('.calendar-panel')
    const todayCell = calendar.querySelector(`[data-date="${today}"]`)
    await user.click(todayCell)

    const taskRegion = document.querySelector('.recent-panel')
    expect(within(taskRegion).getByText('Task selected')).toBeTruthy()
    expect(within(taskRegion).queryByText('Task other')).toBeNull()
    expect(within(taskRegion).queryByText('Task undated')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Add new task' }))
    expect(screen.getByLabelText('Due date').value).toBe(today)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Clear date' }))
    expect(within(taskRegion).getByText('Task other')).toBeTruthy()
    expect(within(taskRegion).getByText('Task undated')).toBeTruthy()
  })

  it('shows a useful empty-date state for a date without tasks', async () => {
    const user = userEvent.setup()
    const today = todayDateValue()
    seedTasks([task('undated', '')])
    render(<App />)
    const cell = document.querySelector(`[data-date="${today}"]`)
    const gridDates = [...document.querySelectorAll('.calendar-date')].map((element) => element.dataset.date)
    const emptyDate = gridDates.find((dateValue) => dateValue !== today)
    await user.click(document.querySelector(`[data-date="${emptyDate}"]`))
    expect(await screen.findByText('No tasks are due on this date.')).toBeTruthy()
    expect(cell.classList.contains('today')).toBe(true)
  })
})
