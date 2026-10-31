import { useEffect, useRef, useState } from 'react'
import { TASK_PRIORITIES, TASK_STATUSES } from '../../utils/tasks.js'

const emptyValues = { title: '', description: '', priority: 'Medium', dueDate: '', status: 'To Do' }

export default function TaskFormDialog({ task, initialDueDate = '', onClose, onSave }) {
  const dialogRef = useRef(null)
  const [values, setValues] = useState(() => task ? {
    title: task.title,
    description: task.description,
    priority: task.priority,
    dueDate: task.dueDate,
    status: task.status,
  } : { ...emptyValues, dueDate: initialDueDate })
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [task])

  function updateField(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    if (name === 'title' && value.trim()) setError('')
  }

  function submit(event) {
    event.preventDefault()
    if (submitting) return
    if (!values.title.trim()) {
      setError('Enter a task title to continue.')
      dialogRef.current?.querySelector('[name="title"]')?.focus()
      return
    }
    setSubmitting(true)
    const result = onSave({ ...values, title: values.title.trim(), description: values.description.trim() })
    if (!result?.accepted) {
      setSubmitting(false)
      setSaveError('The task was not changed because its saved data is protected. Close this form and resolve the storage warning first.')
      return
    }
    onClose()
  }

  return (
    <dialog className="task-dialog" ref={dialogRef} aria-labelledby="task-dialog-title" onCancel={onClose} onClick={(event) => {
      if (event.target === dialogRef.current) onClose()
    }}>
      <form className="task-form" onSubmit={submit} noValidate>
        <div className="dialog-heading">
          <div><h2 id="task-dialog-title">{task ? 'Edit task' : 'Add new task'}</h2><p>{task ? 'Update the details below.' : 'Add the details for your task.'}</p></div>
          <button className="icon-button" type="button" aria-label="Close task form" onClick={onClose}>×</button>
        </div>
        <label className="form-field">Title <span aria-hidden="true">*</span><input autoFocus name="title" value={values.title} onChange={updateField} aria-required="true" required aria-invalid={Boolean(error)} aria-describedby={error ? 'task-title-error' : undefined} maxLength={160} /></label>
        {error && <p className="form-error" id="task-title-error" role="alert">{error}</p>}
        {saveError && <p className="form-error" role="alert">{saveError}</p>}
        <label className="form-field">Description <textarea name="description" value={values.description} onChange={updateField} rows="3" maxLength={1000} /></label>
        <div className="form-grid">
          <label className="form-field">Priority<select name="priority" value={values.priority} onChange={updateField}>{TASK_PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
          <label className="form-field">Status<select name="status" value={values.status} onChange={updateField}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label className="form-field form-date">Due date<input name="dueDate" type="date" value={values.dueDate} onChange={updateField} /></label>
        </div>
        <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="add-task-button" type="submit" disabled={submitting}>{submitting ? 'Saving…' : task ? 'Save changes' : 'Create task'}</button></div>
      </form>
    </dialog>
  )
}