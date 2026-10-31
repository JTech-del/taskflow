import { StrictMode } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import useTasks, {
  backupAndResetStoredTasks,
  readStoredTasks,
  RECOVERY_STORAGE_PREFIX,
  seedStoredTasksIfMissing,
  TASK_STORAGE_KEY,
} from './useTasks.js'
import { createSampleTasks } from '../utils/tasks.js'
import TaskFormDialog from '../components/tasks/TaskFormDialog.jsx'

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open') }
})

afterEach(cleanup)

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
  }
}

function createFailingStorage(initialRaw, { failGet = false, failSet = false } = {}) {
  const storage = createMemoryStorage({ [TASK_STORAGE_KEY]: initialRaw })
  if (failGet) storage.getItem = () => { throw new Error('Storage read denied') }
  if (failSet) storage.setItem = () => { throw new Error('Storage quota exceeded') }
  return storage
}

function HookHarness({ storage }) {
  const state = useTasks(storage)
  return (
    <div>
      <output data-testid="status">{state.persistenceStatus}</output>
      <output data-testid="count">{state.tasks.length}</output>
      <output data-testid="protected">{String(state.isProtected)}</output>
      <output data-testid="can-mutate">{String(state.canMutate)}</output>
      <output data-testid="message">{state.storageMessage}</output>
      <button onClick={() => state.updateTasks([])}>Create mutation</button>
      <button onClick={() => state.updateTasks([])}>Edit mutation</button>
      <button onClick={() => state.updateTasks([])}>Complete mutation</button>
      <button onClick={() => state.updateTasks([])}>Reopen mutation</button>
      <button onClick={() => state.updateTasks([])}>Delete mutation</button>
      <button onClick={state.retryPersistence}>Retry</button>
      <button onClick={state.recoverProtectedData}>Recover</button>
    </div>
  )
}

describe('task storage classification and initialization', () => {
  it('does not write during missing-key initialization and seeds once after commit, including Strict Mode replay', async () => {
    const storage = createMemoryStorage()
    let writes = 0
    const setItem = storage.setItem
    storage.setItem = (key, value) => { writes += 1; setItem(key, value) }

    const initial = readStoredTasks(storage)
    expect(initial.source).toBe('missing')
    expect(writes).toBe(0)

    const view = render(<StrictMode><HookHarness storage={storage} /></StrictMode>)
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('saved'))
    expect(JSON.parse(storage.getItem(TASK_STORAGE_KEY)).tasks).toHaveLength(6)
    expect(writes).toBe(1)

    view.rerender(<StrictMode><HookHarness storage={storage} /></StrictMode>)
    expect(writes).toBe(1)
  })

  it('keeps first-run tasks unsaved and disables mutations when the seed write fails', async () => {
    const storage = createMemoryStorage()
    storage.setItem = () => { throw new Error('Storage quota exceeded') }
    render(<HookHarness storage={storage} />)
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unsaved'))
    expect(screen.getByTestId('count').textContent).toBe('6')
    expect(screen.getByTestId('can-mutate').textContent).toBe('false')
  })

  it('loads populated data and keeps a deliberately saved empty list empty', () => {
    const tasks = createSampleTasks()
    const populated = createMemoryStorage({ [TASK_STORAGE_KEY]: JSON.stringify({ version: 1, tasks }) })
    expect(readStoredTasks(populated).tasks).toHaveLength(6)

    const empty = createMemoryStorage({ [TASK_STORAGE_KEY]: JSON.stringify({ version: 1, tasks: [] }) })
    expect(readStoredTasks(empty)).toMatchObject({ source: 'ready', tasks: [], persistenceStatus: 'saved' })
    expect(seedStoredTasksIfMissing(empty, tasks).tasks).toEqual([])
  })

  it('normalizes omitted optional fields but rejects invalid required task data', () => {
    const task = { ...createSampleTasks()[0] }
    delete task.description
    delete task.dueDate
    const storage = createMemoryStorage({ [TASK_STORAGE_KEY]: JSON.stringify({ version: 1, tasks: [task] }) })
    expect(readStoredTasks(storage).tasks[0]).toMatchObject({ description: '', dueDate: '' })

    for (const invalid of [
      { ...task, id: '' },
      { ...task, dueDate: '2026-02-31' },
      { ...task, status: 'Blocked' },
      { ...task, priority: 'Urgent' },
    ]) {
      const invalidStorage = createMemoryStorage({ [TASK_STORAGE_KEY]: JSON.stringify({ version: 1, tasks: [invalid] }) })
      expect(readStoredTasks(invalidStorage).source).toBe('protected')
    }

    const duplicateStorage = createMemoryStorage({
      [TASK_STORAGE_KEY]: JSON.stringify({ version: 1, tasks: [task, task] }),
    })
    expect(readStoredTasks(duplicateStorage).source).toBe('protected')
  })

  it.each([
    ['malformed JSON', '{bad json', 'malformed'],
    ['unsupported version', JSON.stringify({ version: 2, tasks: [] }), 'unsupported'],
    ['unsupported version with a future payload shape', JSON.stringify({ version: 7, records: [] }), 'unsupported'],
    ['invalid collection', JSON.stringify({ version: 1, tasks: [null] }), 'invalid'],
  ])('protects %s without writing or discarding the raw value', (_label, raw, kind) => {
    const storage = createMemoryStorage({ [TASK_STORAGE_KEY]: raw })
    const result = readStoredTasks(storage)
    expect(result).toMatchObject({ source: 'protected', kind, rawValue: raw })
    expect(storage.getItem(TASK_STORAGE_KEY)).toBe(raw)
    expect(storage.values.size).toBe(1)
  })

  it('reports read failures without crashing or enabling mutations', () => {
    const state = readStoredTasks(() => { throw new Error('denied') })
    expect(state).toMatchObject({ source: 'unavailable', persistenceStatus: 'unavailable' })
  })

  it('retries an unavailable read and resumes safe initialization when storage returns', async () => {
    const storage = createMemoryStorage()
    let readable = false
    const provider = () => {
      if (!readable) throw new Error('Storage access denied')
      return storage
    }
    render(<HookHarness storage={provider} />)
    expect(screen.getByTestId('status').textContent).toBe('unavailable')
    readable = true
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('saved'))
    expect(JSON.parse(storage.getItem(TASK_STORAGE_KEY)).tasks).toHaveLength(6)
  })
})

describe('task persistence and mutation safeguards', () => {
  it('keeps failed writes unsaved and retries successfully', async () => {
    const storage = createFailingStorage(JSON.stringify({ version: 1, tasks: [] }), { failSet: true })
    render(<HookHarness storage={storage} />)
    await userEvent.click(screen.getByRole('button', { name: 'Create mutation' }))
    expect(screen.getByTestId('status').textContent).toBe('unsaved')
    expect(screen.getByTestId('can-mutate').textContent).toBe('false')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.getByTestId('status').textContent).toBe('unsaved')

    storage.setItem = (key, value) => storage.values.set(key, String(value))
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.getByTestId('status').textContent).toBe('saved')
    expect(screen.getByTestId('can-mutate').textContent).toBe('true')
  })

  it('blocks create/edit/complete/reopen/delete mutations while data is protected, unavailable, or unsaved', async () => {
    const protectedStorage = createMemoryStorage({ [TASK_STORAGE_KEY]: '{broken' })
    let protectedWrites = 0
    const protectedSetItem = protectedStorage.setItem
    protectedStorage.setItem = (key, value) => { protectedWrites += 1; protectedSetItem(key, value) }
    const { rerender } = render(<HookHarness storage={protectedStorage} />)
    for (const name of ['Create mutation', 'Edit mutation', 'Complete mutation', 'Reopen mutation', 'Delete mutation']) {
      await userEvent.click(screen.getByRole('button', { name }))
    }
    expect(protectedStorage.getItem(TASK_STORAGE_KEY)).toBe('{broken')
    expect(screen.getByTestId('can-mutate').textContent).toBe('false')
    expect(protectedWrites).toBe(0)

    const unavailableStorage = createFailingStorage('', { failGet: true })
    let unavailableWrites = 0
    unavailableStorage.setItem = () => { unavailableWrites += 1 }
    rerender(<HookHarness key="unavailable" storage={unavailableStorage} />)
    for (const name of ['Create mutation', 'Edit mutation', 'Complete mutation', 'Reopen mutation', 'Delete mutation']) {
      await userEvent.click(screen.getByRole('button', { name }))
    }
    expect(screen.getByTestId('can-mutate').textContent).toBe('false')
    expect(unavailableWrites).toBe(0)

    const unsavedStorage = createFailingStorage(JSON.stringify({ version: 1, tasks: [] }), { failSet: true })
    rerender(<HookHarness key="unsaved" storage={unsavedStorage} />)
    await userEvent.click(screen.getByRole('button', { name: 'Create mutation' }))
    expect(screen.getByTestId('status').textContent).toBe('unsaved')
    let blockedWrites = 0
    unsavedStorage.setItem = () => { blockedWrites += 1; throw new Error('unexpected additional write') }
    for (const name of ['Edit mutation', 'Complete mutation', 'Reopen mutation', 'Delete mutation']) {
      await userEvent.click(screen.getByRole('button', { name }))
    }
    expect(screen.getByTestId('count').textContent).toBe('0')
    expect(blockedWrites).toBe(0)
  })

  it('backs up raw data before reset and protects against backup/reset failure or changed data', () => {
    const raw = '{unknown future data}'
    const storage = createMemoryStorage({ [TASK_STORAGE_KEY]: raw })
    const success = backupAndResetStoredTasks(storage, raw)
    expect(success.ok).toBe(true)
    expect(storage.getItem(success.recoveryKey)).toBe(raw)
    expect(JSON.parse(storage.getItem(TASK_STORAGE_KEY))).toEqual({ version: 1, tasks: [] })
    expect(success.recoveryKey.startsWith(RECOVERY_STORAGE_PREFIX)).toBe(true)

    const backupFailure = createMemoryStorage({ [TASK_STORAGE_KEY]: raw })
    backupFailure.setItem = (key, value) => {
      if (key.startsWith(RECOVERY_STORAGE_PREFIX)) throw new Error('quota')
      backupFailure.values.set(key, value)
    }
    expect(backupAndResetStoredTasks(backupFailure, raw).reason).toBe('backup')
    expect(backupFailure.getItem(TASK_STORAGE_KEY)).toBe(raw)

    const resetFailure = createMemoryStorage({ [TASK_STORAGE_KEY]: raw })
    let writes = 0
    resetFailure.setItem = (key, value) => {
      writes += 1
      if (key === TASK_STORAGE_KEY && writes === 2) throw new Error('quota')
      resetFailure.values.set(key, value)
    }
    const failedReset = backupAndResetStoredTasks(resetFailure, raw)
    expect(failedReset.reason).toBe('reset')
    expect(resetFailure.getItem(TASK_STORAGE_KEY)).toBe(raw)
    expect(resetFailure.getItem(failedReset.recoveryKey)).toBe(raw)

    const changed = createMemoryStorage({ [TASK_STORAGE_KEY]: 'newer data' })
    expect(backupAndResetStoredTasks(changed, raw)).toMatchObject({ ok: false, reason: 'changed' })
    expect(changed.values.size).toBe(1)
  })

  it('updates UI state after recovery succeeds and preserves protected state when recovery fails', async () => {
    const raw = '{bad json}'
    const storage = createMemoryStorage({ [TASK_STORAGE_KEY]: raw })
    render(<HookHarness storage={storage} />)
    await userEvent.click(screen.getByRole('button', { name: 'Recover' }))
    expect(screen.getByTestId('protected').textContent).toBe('false')
    expect(screen.getByTestId('status').textContent).toBe('saved')
    expect(screen.getByTestId('count').textContent).toBe('0')

    const failing = createMemoryStorage({ [TASK_STORAGE_KEY]: raw })
    failing.setItem = (key, value) => {
      if (key.startsWith(RECOVERY_STORAGE_PREFIX)) throw new Error('quota')
      failing.values.set(key, value)
    }
    cleanup()
    render(<HookHarness storage={failing} />)
    await userEvent.click(screen.getByRole('button', { name: 'Recover' }))
    expect(screen.getByTestId('protected').textContent).toBe('true')
    expect(failing.getItem(TASK_STORAGE_KEY)).toBe(raw)
  })
})

describe('task form save failure', () => {
  it('keeps the form open and announces a rejected protected-data save', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<TaskFormDialog task={null} onClose={onClose} onSave={() => ({ accepted: false, persisted: false })} />)
    await user.type(screen.getByLabelText(/Title/), 'Protected task')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    expect((await screen.findByRole('alert')).textContent).toContain('task was not changed')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes after an accepted write failure, which the app reports as unsaved', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<TaskFormDialog task={null} onClose={onClose} onSave={() => ({ accepted: true, persisted: false })} />)
    await user.type(screen.getByLabelText(/Title/), 'Unsaved task')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
