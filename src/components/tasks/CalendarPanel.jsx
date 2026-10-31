import { getCalendarDays, todayDateValue } from '../../utils/tasks.js'

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function CalendarPanel({ year, month, tasks, selectedDate, onMonthChange, onDateSelect, tasksAvailable = true }) {
  const today = todayDateValue()
  const days = getCalendarDays(year, month)
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(year, month, 1))
  const taskDates = new Set(tasks.filter((task) => task.dueDate).map((task) => task.dueDate))
  const hasMonthTasks = [...taskDates].some((dateValue) => dateValue.startsWith(`${year}-${String(month + 1).padStart(2, '0')}-`))

  return (
    <section className="panel calendar-panel" id="calendar" aria-labelledby="calendar-title">
      <div className="panel-heading compact-heading">
        <div><h2 id="calendar-title">{monthLabel}</h2><p>Select a date to view its tasks</p></div>
        <div className="calendar-arrows">
          <button className="icon-button" type="button" aria-label="Previous month" onClick={() => onMonthChange(-1)}>‹</button>
          <button className="icon-button" type="button" aria-label="Next month" onClick={() => onMonthChange(1)}>›</button>
        </div>
      </div>
      <div className="calendar-grid">
        {weekdays.map((day) => <span className="weekday" key={day} aria-hidden="true">{day}</span>)}
        {days.map(({ dateValue, day, inMonth }) => {
          const isToday = dateValue === today
          const isSelected = dateValue === selectedDate
          const hasTasks = taskDates.has(dateValue)
          const label = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${dateValue}T12:00:00`))
          return (
            <button
              className={`calendar-date${inMonth ? '' : ' outside'}${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}${hasTasks ? ' has-event' : ''}`}
              type="button"
              aria-label={`${label}${hasTasks ? ', has tasks due' : ''}${isToday ? ', today' : ''}`}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={isSelected}
              data-date={dateValue}
              key={dateValue}
              onClick={() => onDateSelect(dateValue)}
            >
              {day}
            </button>
          )
        })}
      </div>
      {tasksAvailable && !hasMonthTasks && <p className="calendar-empty-month">No tasks due this month.</p>}
      <div className="calendar-legend"><span><i className="legend-dot accent-dot" />Today</span><span><i className="legend-dot event-dot" />Has tasks</span></div>
    </section>
  )
}
