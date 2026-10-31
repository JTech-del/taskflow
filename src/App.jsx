import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import CalendarPanel from './components/tasks/CalendarPanel.jsx'
import TaskFormDialog from './components/tasks/TaskFormDialog.jsx'
import useTasks from './hooks/useTasks.js'
import { classifyTaskDeadline, createTaskId, filterTasks, filterTasksByDeadline, formatDate, getDeadlineLabel, getTaskStats, getTasksForDate, getUpcomingTasks, parseDateValue, shiftCalendarMonth, todayDateValue } from './utils/tasks.js'

function Icon({ name, size = 20, ...props }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    tasks: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z" transform="translate(-1 -1) scale(1.08)" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    alert: <><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 3h.01" /></>,
    chevronLeft: <path d="m15 18-6-6 6-6" />,
    chevronRight: <path d="m9 18 6-6-6-6" />,
    sparkle: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1.2 2.8L23 18l-2.8 1.2L19 22l-1.2-2.8L15 18l2.8-1.2L19 14Z" /></>,
  }

  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {paths[name]}
    </svg>
  )
}

function Sidebar({ taskCount, activeSection, onNavigate }) {
  const navigation = [
    { label: 'Dashboard', icon: 'grid', target: 'dashboard' },
    { label: 'My Tasks', icon: 'tasks', target: 'tasks' },
    { label: 'Calendar', icon: 'calendar', target: 'calendar' },
  ]

  return (
    <aside className="sidebar">
      <a className="brand" href="#dashboard" aria-label="TaskFlow dashboard" onClick={() => onNavigate('dashboard')}>
        <span className="brand-mark"><Icon name="check" size={19} /></span>
        <span>task<span>flow</span></span>
      </a>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="primary-nav" aria-label="Main navigation">
        {navigation.map((item) => (
          <button
            type="button"
            key={item.label}
            className={`nav-link${item.target === activeSection ? ' active' : ''}`}
            aria-label={item.label}
            aria-current={item.target === activeSection ? 'page' : undefined}
            onClick={() => onNavigate(item.target)}
          >
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
            {item.label === 'My Tasks' && <span className="nav-count">{taskCount}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="workspace-caption">YOUR WORKSPACE</div>
        <div className="profile">
          <span className="avatar avatar-profile">JD</span>
          <span className="profile-copy"><strong>Jordan Davis</strong><small>Frontend developer</small></span>
        </div>
      </div>
    </aside>
  )
}

function TopBar({ query, onQueryChange }) {
  return (
    <header className="topbar">
      <label className="search-box">
        <Icon name="search" size={18} />
        <span className="sr-only">Search tasks</span>
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search tasks..." />
      </label>
      <div className="topbar-actions">
        <span className="avatar avatar-top">JD</span>
      </div>
    </header>
  )
}

function SummaryCard({ item, onClick, active }) {
  return (
    <button className={`summary-card${active ? ' active' : ''}`} type="button" onClick={onClick} aria-pressed={active}>
      <div className={`summary-icon ${item.tone}`}><Icon name={item.icon} size={19} /></div>
      <div className="summary-copy"><span>{item.label}</span><strong>{item.count}</strong><small>{item.detail}</small></div>
      <span className={`summary-spark ${item.tone}`} aria-hidden="true"><Icon name="arrow" size={17} /></span>
    </button>
  )
}

function TaskRow({ task, onToggle, onEdit, onDelete, canMutate }) {
  const completed = task.status === 'Completed'
  const deadlineState = classifyTaskDeadline(task)
  const deadlineLabel = getDeadlineLabel(deadlineState)
  return (
    <article className="task-row">
      <input className="task-check" type="checkbox" checked={completed} onChange={() => onToggle(task)} aria-label={`${completed ? 'Reopen' : 'Complete'} ${task.title}`} disabled={!canMutate} />
      <div className="task-title-block"><strong className={completed ? 'completed-task-title' : ''}>{task.title}</strong><small>{task.description || 'No description'}</small><span className="task-details-mobile"><span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span><span className={`deadline-badge deadline-${deadlineState}`}>{deadlineLabel}</span><span className={`status status-${task.status.toLowerCase().replace(' ', '-')}`}><i />{task.status}</span></span></div>
      <span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
      <span className="task-deadline-info"><span className="task-date">{formatDate(task.dueDate)}</span><span className={`deadline-badge deadline-${deadlineState}`}>{deadlineLabel}</span></span>
      <span className={`status status-${task.status.toLowerCase().replace(' ', '-')}`}><i />{task.status}</span>
      <span className="task-actions"><button type="button" onClick={(event) => onEdit(task, event.currentTarget)} disabled={!canMutate}>Edit</button><button type="button" onClick={() => onDelete(task)} disabled={!canMutate}>Delete</button></span>
    </article>
  )
}

function RecentTasks({ taskList, filters, onFiltersChange, onClearFilters, hasFilters, hasTasks, collectionUnavailable, onToggle, onEdit, onDelete, canMutate, selectedDate, onClearSelectedDate, deadlineFilter, onDeadlineFilterChange }) {
  return (
    <section className="panel recent-panel" id="tasks" aria-labelledby="recent-title">
      <div className="panel-heading">
        <div><h2 id="recent-title">{selectedDate ? `Tasks for ${formatDate(selectedDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}` : 'Tasks'}</h2><p>{selectedDate ? 'Tasks due on the selected date' : 'Search, filter, and manage your work'}</p></div>
        {selectedDate && <button className="text-action clear-filters" type="button" onClick={onClearSelectedDate}>Clear date</button>}
        {hasFilters && <button className="text-action clear-filters" type="button" onClick={onClearFilters}>Clear filters</button>}
      </div>
      {!selectedDate && <div className="task-filters"><label>Filter by status<select aria-label="Filter by status" value={filters.status} onChange={(event) => onFiltersChange({ ...filters, status: event.target.value })}><option>All</option><option>To Do</option><option>In Progress</option><option>Completed</option></select></label><label>Filter by priority<select aria-label="Filter by priority" value={filters.priority} onChange={(event) => onFiltersChange({ ...filters, priority: event.target.value })}><option>All</option><option>Low</option><option>Medium</option><option>High</option></select></label><label>Filter by deadline<select aria-label="Filter by deadline" value={deadlineFilter} onChange={(event) => onDeadlineFilterChange(event.target.value)}><option value="All">All</option><option value="overdue">Overdue</option><option value="today">Due today</option><option value="upcoming">Upcoming</option><option value="completed">Completed</option><option value="no-date">No due date</option></select></label></div>}
      <div className="task-table-head" aria-hidden="true"><span /><span>TASK</span><span>PRIORITY</span><span>DUE DATE</span><span>STATUS</span><span /></div>
      <div className="task-list">
        {taskList.length ? taskList.map((task) => <TaskRow key={task.id} task={task} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} canMutate={canMutate} />) : <p className="empty-state">{collectionUnavailable ? 'Tasks are protected until storage is accessible or you explicitly reset the saved data.' : selectedDate ? 'No tasks are due on this date.' : hasTasks ? 'No tasks match your search and filters.' : 'No tasks yet. Add a task to get started.'}</p>}
      </div>
      <div className="task-footer"><span>Showing {taskList.length} {taskList.length === 1 ? 'task' : 'tasks'}</span></div>
    </section>
  )
}

function DeadlinesPanel({ tasks }) {
  const upcoming = getUpcomingTasks(tasks)
  return (
    <section className="panel deadlines-panel" aria-labelledby="deadlines-title">
      <div className="panel-heading compact-heading"><div><h2 id="deadlines-title">Upcoming deadlines</h2><p>Outstanding tasks, soonest first</p></div></div>
      {upcoming.length ? <ul className="deadline-list">{upcoming.map((task) => { const deadlineState = classifyTaskDeadline(task); return <li className="deadline-item" key={task.id}><span className="deadline-date orange"><strong>{formatDate(task.dueDate, { day: '2-digit' })}</strong><small>{formatDate(task.dueDate, { month: 'short' }).toUpperCase()}</small></span><span className="deadline-copy"><strong>{task.title}</strong><small>{formatDate(task.dueDate, { weekday: 'short', month: 'short', day: 'numeric' })} · {getDeadlineLabel(deadlineState)}</small></span><span className={`deadline-marker deadline-marker-${deadlineState}`} /></li> })}</ul> : <p className="empty-state deadline-empty">No outstanding deadlines.</p>}
    </section>
  )
}

function QuickActions({ onAdd, canMutate }) {
  return (
    <section className="quick-action-panel" aria-labelledby="quick-action-title">
      <span className="quick-action-icon"><Icon name="sparkle" size={20} /></span>
      <div><h2 id="quick-action-title">Make it happen</h2><p>Capture your next idea and keep the momentum going.</p></div>
      <button className="add-task-button" type="button" onClick={onAdd} disabled={!canMutate}><Icon name="plus" size={18} />Add new task</button>
    </section>
  )
}

function App() {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ status: 'All', priority: 'All' })
  const [deadlineFilter, setDeadlineFilter] = useState('All')
  const [editor, setEditor] = useState(null)
  const [activeSection, setActiveSection] = useState('dashboard')
  const [today, setToday] = useState(todayDateValue())
  const [selectedDate, setSelectedDate] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const current = parseDateValue(todayDateValue())
    return { year: current.getFullYear(), month: current.getMonth() }
  })
  const {
    tasks,
    updateTasks,
    persistenceStatus,
    storageMessage,
    isProtected,
    canReset,
    canMutate,
    retryPersistence,
    recoverProtectedData,
  } = useTasks()
  const returnFocusRef = useRef(null)
  const stats = useMemo(() => getTaskStats(tasks, today), [tasks, today])
  const filteredTasks = useMemo(() => filterTasks(tasks, { query, ...filters }), [tasks, query, filters])
  const selectedDateTasks = useMemo(() => getTasksForDate(tasks, selectedDate), [tasks, selectedDate])
  const displayedTasks = selectedDate ? selectedDateTasks : filterTasksByDeadline(filteredTasks, deadlineFilter, today)
  const hasFilters = Boolean(query.trim() || filters.status !== 'All' || filters.priority !== 'All' || deadlineFilter !== 'All')
  const summary = [
    { label: 'Total tasks', count: stats.total, detail: 'In your task list', icon: 'grid', tone: 'orange', active: !hasFilters && !selectedDate, action: () => { setActiveSection('tasks'); setQuery(''); setFilters({ status: 'All', priority: 'All' }); setDeadlineFilter('All'); setSelectedDate('') } },
    { label: 'To do', count: stats.toDo, detail: 'Ready to start', icon: 'tasks', tone: 'red', active: filters.status === 'To Do' && !selectedDate, action: () => setStatusSummary('To Do') },
    { label: 'In progress', count: stats.inProgress, detail: 'Currently underway', icon: 'clock', tone: 'blue', active: filters.status === 'In Progress' && !selectedDate, action: () => setStatusSummary('In Progress') },
    { label: 'Completed', count: stats.completed, detail: 'Finished tasks', icon: 'check', tone: 'green', active: (filters.status === 'Completed' || deadlineFilter === 'completed') && !selectedDate, action: () => setStatusSummary('Completed') },
    { label: 'Overdue', count: stats.overdue, detail: 'Needs your attention', icon: 'alert', tone: 'red', active: deadlineFilter === 'overdue' && !selectedDate, action: () => { setActiveSection('tasks'); setQuery(''); setFilters({ status: 'All', priority: 'All' }); setDeadlineFilter('overdue'); setSelectedDate('') } },
  ]

  function setStatusSummary(status) {
    setActiveSection('tasks')
    setQuery('')
    setFilters({ status, priority: 'All' })
    setDeadlineFilter('All')
    setSelectedDate('')
  }

  function navigateTo(target) {
    setActiveSection(target)
    if (target === 'tasks') setSelectedDate('')
    document.getElementById(target)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  function openCreate(trigger) {
    returnFocusRef.current = trigger
    if (!canMutate) return
    setEditor({ task: null, initialDueDate: selectedDate })
  }

  function openEdit(task, trigger) {
    returnFocusRef.current = trigger
    if (!canMutate) return
    setEditor({ task })
  }

  function closeEditor() {
    setEditor(null)
    requestAnimationFrame(() => returnFocusRef.current?.focus())
  }

  function saveTask(values) {
    const now = new Date().toISOString()
    if (editor.task) {
      return updateTasks(tasks.map((task) => task.id === editor.task.id ? { ...task, ...values, updatedAt: now } : task))
    } else {
      return updateTasks([{ id: createTaskId(), ...values, createdAt: now, updatedAt: now }, ...tasks])
    }
  }

  function toggleTask(task) {
    const status = task.status === 'Completed' ? 'To Do' : 'Completed'
    updateTasks(tasks.map((item) => item.id === task.id ? { ...item, status, updatedAt: new Date().toISOString() } : item))
  }

  function deleteTask(task) {
    if (window.confirm(`Delete “${task.title}”? This cannot be undone.`)) {
      updateTasks(tasks.filter((item) => item.id !== task.id))
    }
  }

  function resetProtectedData() {
    if (!canReset || !window.confirm('Reset the saved task data? This may discard locally stored data. A raw recovery copy will be saved in this browser first if storage permits.')) return
    recoverProtectedData()
  }

  function changeCalendarMonth(amount) {
    setCalendarMonth((current) => shiftCalendarMonth(current.year, current.month, amount))
  }

  function selectCalendarDate(dateValue) {
    setActiveSection('calendar')
    setSelectedDate(dateValue)
    const date = parseDateValue(dateValue)
    setCalendarMonth({ year: date.getFullYear(), month: date.getMonth() })
  }

  useEffect(() => {
    const timer = window.setInterval(() => setToday(todayDateValue()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="app-shell" id="dashboard">
      <Sidebar taskCount={tasks.length} activeSection={activeSection} onNavigate={navigateTo} />
      <div className="main-shell">
        <TopBar query={query} onQueryChange={setQuery} />
        <main className="dashboard-main">
          <section className="welcome-row"><div><p className="eyebrow">{formatDate(today, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}</p><h1>Good morning, Jordan <span>✦</span></h1><p className="welcome-subtitle">Here’s what’s happening with your work today.</p></div><div className="welcome-note"><span className="note-dot" />You’re right on track <small>Keep the momentum going</small></div></section>
          <section className="summary-grid" aria-label="Task summary">{summary.map((item) => <SummaryCard key={item.label} item={item} onClick={item.action} active={item.active} />)}</section>
          <div className="dashboard-columns">
            <div className="primary-column"><RecentTasks taskList={displayedTasks} filters={filters} onFiltersChange={setFilters} deadlineFilter={deadlineFilter} onDeadlineFilterChange={setDeadlineFilter} hasFilters={!selectedDate && hasFilters} hasTasks={tasks.length > 0} collectionUnavailable={isProtected || persistenceStatus === 'unavailable'} canMutate={canMutate} selectedDate={selectedDate} onClearSelectedDate={() => setSelectedDate('')} onClearFilters={() => { setQuery(''); setFilters({ status: 'All', priority: 'All' }); setDeadlineFilter('All') }} onToggle={toggleTask} onEdit={openEdit} onDelete={deleteTask} /></div>
            <aside className="right-column" aria-label="Schedule and actions"><CalendarPanel {...calendarMonth} tasks={tasks} tasksAvailable={!isProtected && persistenceStatus !== 'unavailable'} selectedDate={selectedDate} onMonthChange={changeCalendarMonth} onDateSelect={selectCalendarDate} /><DeadlinesPanel tasks={tasks} /><QuickActions canMutate={canMutate} onAdd={(event) => openCreate(event.currentTarget)} /></aside>
          </div>
          <footer className="dashboard-footer"><span>TaskFlow <i /> Your focus, in flow.</span><span>{persistenceStatus === 'saved' ? 'Saved in this browser' : persistenceStatus === 'unsaved' ? 'Unsaved changes' : persistenceStatus === 'initializing' ? 'Saving starter tasks locally' : persistenceStatus === 'protected' ? 'Saved data protected' : 'Browser storage unavailable'} · {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</span></footer>
          {storageMessage && <div className="storage-warning" role="status"><span>{storageMessage}</span>{persistenceStatus === 'unsaved' && <button className="storage-action" type="button" onClick={retryPersistence}>Retry saving</button>}{persistenceStatus === 'unavailable' && <button className="storage-action" type="button" onClick={retryPersistence}>Retry storage access</button>}{isProtected && canReset && <button className="storage-action" type="button" onClick={resetProtectedData}>Reset local task data</button>}</div>}
        </main>
      </div>
      {editor && <TaskFormDialog key={editor.task?.id ?? `new-task-${editor.initialDueDate}`} task={editor.task} initialDueDate={editor.initialDueDate} onClose={closeEditor} onSave={saveTask} />}
    </div>
  )
}

export default App
