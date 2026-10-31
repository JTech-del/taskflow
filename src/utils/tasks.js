export const TASK_STATUSES = ['To Do', 'In Progress', 'Completed']
export const TASK_PRIORITIES = ['Low', 'Medium', 'High']

export function createTaskId() {
  return globalThis.crypto?.randomUUID?.() ?? `task-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function todayDateValue(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isValidDateValue(dateValue) {
  if (typeof dateValue !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return false
  const [year, month, day] = dateValue.split('-').map(Number)
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(0, 0, 0, 0)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

export function parseDateValue(dateValue) {
  if (!isValidDateValue(dateValue)) return null
  const [year, month, day] = dateValue.split('-').map(Number)
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(0, 0, 0, 0)
  return date
}

export function shiftCalendarMonth(year, month, amount) {
  const shifted = new Date(year, month + amount, 1)
  return { year: shifted.getFullYear(), month: shifted.getMonth() }
}

export function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1)
  const mondayOffset = (firstDay.getDay() + 6) % 7
  const gridStart = new Date(year, month, 1 - mondayOffset)
  const dayCount = new Date(year, month + 1, 0).getDate()
  const cellCount = Math.ceil((mondayOffset + dayCount) / 7) * 7

  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return {
      dateValue: todayDateValue(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month,
    }
  })
}

export function getTasksForDate(tasks, dateValue) {
  return sortTasksByDueDate(tasks.filter((task) => task.dueDate === dateValue))
}

export function formatDate(dateValue, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!dateValue) return 'No due date'
  const date = parseDateValue(dateValue)
  if (!date) return 'Invalid date'
  return new Intl.DateTimeFormat(undefined, options).format(date)
}

export function classifyTaskDeadline(task, today = todayDateValue()) {
  if (task.status === 'Completed') return 'completed'
  if (!task.dueDate) return 'no-date'
  if (!isValidDateValue(task.dueDate) || !isValidDateValue(today)) return 'invalid-date'
  if (task.dueDate < today) return 'overdue'
  if (task.dueDate === today) return 'today'
  return 'upcoming'
}

export function getDeadlineLabel(deadlineState) {
  return {
    overdue: 'Overdue',
    today: 'Due today',
    upcoming: 'Upcoming',
    completed: 'Completed',
    'no-date': 'No due date',
    'invalid-date': 'Invalid due date',
  }[deadlineState]
}

export function normalizeTask(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) return null
  const normalized = {
    ...task,
    description: task.description === undefined ? '' : task.description,
    dueDate: task.dueDate === undefined ? '' : task.dueDate,
  }
  return isValidNormalizedTask(normalized) ? normalized : null
}

function isValidNormalizedTask(task) {
  const validDueDate = task.dueDate === '' || isValidDateValue(task.dueDate)
  return Boolean(
    typeof task.id === 'string' && task.id.trim() &&
    typeof task.title === 'string' && task.title.trim() &&
    typeof task.description === 'string' &&
    TASK_PRIORITIES.includes(task.priority) &&
    TASK_STATUSES.includes(task.status) &&
    validDueDate &&
    typeof task.createdAt === 'string' && Number.isFinite(Date.parse(task.createdAt)) &&
    typeof task.updatedAt === 'string' && Number.isFinite(Date.parse(task.updatedAt)),
  )
}

export function isValidTask(task) {
  return normalizeTask(task) !== null
}

export function createSampleTasks(now = new Date()) {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const due = (offset) => {
    const date = new Date(base)
    date.setDate(date.getDate() + offset)
    return todayDateValue(date)
  }
  const createdAt = new Date(base.getTime() - 86400000 * 2).toISOString()
  const samples = [
    ['Review onboarding flow', 'Map the final onboarding screens and note any friction.', 'High', 'In Progress', 0],
    ['Prepare sprint planning notes', 'Collect priorities and open questions for the team.', 'Medium', 'In Progress', 0],
    ['Update component documentation', 'Document the latest shared component changes.', 'Low', 'To Do', 1],
    ['Finalize Q4 project roadmap', 'Confirm milestones with product and engineering.', 'High', 'To Do', -1],
    ['Share research findings', 'Summarize key takeaways from the latest interviews.', 'Medium', 'Completed', 3],
    ['Check in with engineering', 'Follow up on the integration timeline.', 'Low', 'To Do', 4],
  ]
  return samples.map(([title, description, priority, status, dueOffset], index) => ({
    id: `sample-task-${index + 1}`,
    title,
    description,
    priority,
    status,
    dueDate: due(dueOffset),
    createdAt,
    updatedAt: createdAt,
  }))
}

export function sortTasksByDueDate(tasks) {
  return [...tasks].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return a.title.localeCompare(b.title)
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title)
  })
}

export function getTaskStats(tasks, today = todayDateValue()) {
  return tasks.reduce((stats, task) => {
    stats.total += 1
    if (task.status === 'Completed') stats.completed += 1
    if (task.status === 'In Progress') stats.inProgress += 1
    if (task.status === 'To Do') stats.toDo += 1
    if (classifyTaskDeadline(task, today) === 'overdue') stats.overdue += 1
    return stats
  }, { total: 0, completed: 0, inProgress: 0, toDo: 0, overdue: 0 })
}

export function filterTasks(tasks, { query = '', status = 'All', priority = 'All' } = {}) {
  const normalizedQuery = query.trim().toLowerCase()
  return sortTasksByDueDate(tasks.filter((task) => (
    (status === 'All' || task.status === status) &&
    (priority === 'All' || task.priority === priority) &&
    (!normalizedQuery || `${task.title} ${task.description}`.toLowerCase().includes(normalizedQuery))
  )))
}

export function getUpcomingTasks(tasks, today = todayDateValue(), limit = 5) {
  return sortTasksByDueDate(tasks.filter((task) => {
    const deadline = classifyTaskDeadline(task, today)
    return deadline === 'today' || deadline === 'upcoming'
  })).slice(0, limit)
}

export function filterTasksByDeadline(tasks, deadline = 'All', today = todayDateValue()) {
  return sortTasksByDueDate(tasks.filter((task) => deadline === 'All' || classifyTaskDeadline(task, today) === deadline))
}