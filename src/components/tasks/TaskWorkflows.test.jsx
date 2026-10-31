import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App.jsx'
import { TASK_STORAGE_KEY } from '../../hooks/useTasks.js'
import { classifyTaskDeadline, filterTasks, filterTasksByDeadline, formatDate, getDeadlineLabel, getTaskStats, isValidDateValue, parseDateValue, todayDateValue } from '../../utils/tasks.js'

beforeEach(() => {
  window.localStorage.clear()
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open') }
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

function makeTask({ id, title = `Task ${id}`, status = 'To Do', dueDate = '', priority = 'Medium', description = '' }) {
  return { id, title, status, dueDate, priority, description, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }
}

function seed(tasks) {
  window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify({ version: 1, tasks }))
}

describe('deadline classification', () => {
  it('rejects malformed and impossible dates without normalizing or throwing', () => {
    for (const invalidDate of ['not-a-date', '2026-99-99', '2026-02-31', '2026-2-03']) {
      expect(isValidDateValue(invalidDate)).toBe(false)
      expect(parseDateValue(invalidDate)).toBeNull()
      expect(formatDate(invalidDate)).toBe('Invalid date')
      expect(classifyTaskDeadline(makeTask({ id: invalidDate, dueDate: invalidDate }), '2026-10-31')).toBe('invalid-date')
    }
  })

  it('validates leap days and classifies local date boundaries', () => {
    expect(isValidDateValue('2024-02-29')).toBe(true)
    expect(isValidDateValue('2025-02-29')).toBe(false)
    expect(formatDate('2024-02-29', { month: 'short', day: 'numeric', year: 'numeric' })).toContain('Feb 29, 2024')

    const today = '2026-10-31'
    expect(classifyTaskDeadline(makeTask({ id: 'yesterday', dueDate: '2026-10-30' }), today)).toBe('overdue')
    expect(classifyTaskDeadline(makeTask({ id: 'today', dueDate: today }), today)).toBe('today')
    expect(classifyTaskDeadline(makeTask({ id: 'tomorrow', dueDate: '2026-11-01' }), today)).toBe('upcoming')
  })

  it('classifies overdue, today, upcoming, completed, and undated tasks consistently', () => {
    const today = '2026-10-31'
    const cases = [
      [makeTask({ id: 'late', dueDate: '2026-10-30' }), 'overdue', 'Overdue'],
      [makeTask({ id: 'today', dueDate: today }), 'today', 'Due today'],
      [makeTask({ id: 'future', dueDate: '2026-11-01' }), 'upcoming', 'Upcoming'],
      [makeTask({ id: 'done-late', dueDate: '2026-10-01', status: 'Completed' }), 'completed', 'Completed'],
      [makeTask({ id: 'undated' }), 'no-date', 'No due date'],
      [makeTask({ id: 'done-undated', status: 'Completed' }), 'completed', 'Completed'],
    ]
    for (const [task, state, label] of cases) {
      expect(classifyTaskDeadline(task, today)).toBe(state)
      expect(getDeadlineLabel(state)).toBe(label)
    }
  })

  it('counts only unfinished past-date tasks as overdue and filters deadline state alongside search/status/priority', () => {
    const today = '2026-10-31'
    const tasks = [
      makeTask({ id: 'overdue-high', title: 'Review overdue report', dueDate: '2026-10-30', priority: 'High' }),
      makeTask({ id: 'overdue-done', dueDate: '2026-10-01', status: 'Completed' }),
      makeTask({ id: 'today-high', title: 'Review today report', dueDate: today, priority: 'High' }),
      makeTask({ id: 'undated-high', title: 'Review undated report', priority: 'High' }),
    ]
    expect(getTaskStats(tasks, today).overdue).toBe(1)
    expect(filterTasksByDeadline(tasks, 'overdue', today).map((task) => task.id)).toEqual(['overdue-high'])
    const searched = filterTasks(tasks, { query: 'review', status: 'To Do', priority: 'High' })
    expect(filterTasksByDeadline(searched, 'today', today).map((task) => task.id)).toEqual(['today-high'])
    expect(filterTasksByDeadline(searched, 'no-date', today).map((task) => task.id)).toEqual(['undated-high'])
  })
})

describe('dashboard task workflows', () => {
  it('summary cards open corresponding task views and preserve combined filters when clearing calendar date', async () => {
    const user = userEvent.setup()
    const today = todayDateValue()
    seed([
      makeTask({ id: 'late', title: 'Late report', dueDate: '2026-10-30', priority: 'High' }),
      makeTask({ id: 'today', title: 'Today report', dueDate: today, priority: 'High' }),
      makeTask({ id: 'tomorrow', title: 'Tomorrow draft', dueDate: '2026-11-01', priority: 'Low' }),
      makeTask({ id: 'completed', title: 'Finished report', status: 'Completed', dueDate: '2026-10-01' }),
    ])
    render(<App />)
    const taskPanel = document.querySelector('.recent-panel')

    await user.click(screen.getByRole('button', { name: /Overdue/ }))
    expect(within(taskPanel).getByText('Late report')).toBeTruthy()
    expect(within(taskPanel).queryByText('Today report')).toBeNull()

    await user.click(screen.getByRole('button', { name: /Completed/ }))
    expect(within(taskPanel).getByText('Finished report')).toBeTruthy()
    expect(within(taskPanel).queryByText('Late report')).toBeNull()
    expect(screen.getByRole('button', { name: /Completed/ }).getAttribute('aria-pressed')).toBe('true')

    await user.click(screen.getByRole('button', { name: /Total tasks/ }))
    await user.selectOptions(screen.getByLabelText('Filter by deadline'), 'completed')
    expect(screen.getByRole('button', { name: /Completed/ }).getAttribute('aria-pressed')).toBe('true')
    expect(within(taskPanel).getByText('Finished report')).toBeTruthy()
    await user.selectOptions(screen.getByLabelText('Filter by deadline'), 'All')
    const deadlinePanelText = document.querySelector('.deadlines-panel').textContent
    expect(deadlinePanelText).toContain('Due today')
    expect(deadlinePanelText).toContain('Upcoming')
    expect(deadlinePanelText).not.toContain('No due date')
    await user.type(screen.getByRole('textbox', { name: 'Search tasks' }), 'report')
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'To Do')
    await user.selectOptions(screen.getByLabelText('Filter by priority'), 'High')
    const todayCell = document.querySelector(`.calendar-date[data-date="${today}"]`)
    await user.click(todayCell)
    expect(within(taskPanel).getByText('Today report')).toBeTruthy()
    expect(within(taskPanel).queryByText('Tomorrow draft')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Clear date' }))
    expect(screen.getByRole('textbox', { name: 'Search tasks' }).value).toBe('report')
    expect(screen.getByLabelText('Filter by status').value).toBe('To Do')
    expect(screen.getByLabelText('Filter by priority').value).toBe('High')
    expect(within(taskPanel).getByText('Today report')).toBeTruthy()
    expect(within(taskPanel).getByText('Late report')).toBeTruthy()
    expect(within(taskPanel).queryByText('Tomorrow draft')).toBeNull()
  })

  it('supports complete, reopen, edit, delete, and readable task descriptions', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const longDescription = 'A detailed task description that should wrap and remain fully readable in the task row.'
    seed([makeTask({ id: 'workflow', title: 'Workflow task', description: longDescription, dueDate: todayDateValue() })])
    render(<App />)
    const taskPanel = document.querySelector('.recent-panel')
    const taskRow = taskPanel.querySelector('.task-row')
    expect(within(taskRow).getByText(longDescription)).toBeTruthy()
    expect(taskRow.querySelector('.deadline-today').textContent).toBe('Due today')

    await user.click(within(taskRow).getByRole('checkbox', { name: 'Complete Workflow task' }))
    expect(taskRow.querySelector('.deadline-completed').textContent).toBe('Completed')

    await user.click(within(taskRow).getByRole('checkbox', { name: 'Reopen Workflow task' }))
    expect(taskRow.querySelector('.deadline-today').textContent).toBe('Due today')

    await user.click(within(taskRow).getByRole('button', { name: 'Edit' }))
    const dialog = screen.getByRole('dialog')
    await user.clear(screen.getByLabelText('Description'))
    await user.type(screen.getByLabelText('Description'), 'Edited details remain visible.')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(within(taskRow).getByText('Edited details remain visible.')).toBeTruthy()

    await user.click(within(taskRow).getByRole('button', { name: 'Delete' }))
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(within(taskPanel).queryByText('Workflow task')).toBeNull()
  })

  it('navigates sidebar links to the existing task and calendar sections', async () => {
    const user = userEvent.setup()
    seed([])
    render(<App />)
    const scroll = vi.fn()
    document.getElementById('dashboard').scrollIntoView = scroll
    document.getElementById('tasks').scrollIntoView = scroll
    document.getElementById('calendar').scrollIntoView = scroll
    await user.click(screen.getByRole('button', { name: 'My Tasks' }))
    await user.click(screen.getByRole('button', { name: 'Calendar' }))
    expect(screen.getByRole('button', { name: 'Calendar' }).getAttribute('aria-current')).toBe('page')
    await user.click(screen.getByRole('link', { name: 'TaskFlow dashboard' }))
    expect(window.location.hash).toBe('#dashboard')
    expect(screen.getByRole('button', { name: 'Dashboard' }).getAttribute('aria-current')).toBe('page')
    expect(scroll).toHaveBeenCalledTimes(3)
  })
})
