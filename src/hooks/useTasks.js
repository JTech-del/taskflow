import { useEffect, useState } from 'react'
import { createSampleTasks, normalizeTask } from '../utils/tasks.js'

export const TASK_STORAGE_KEY = 'taskflow.tasks.v1'
export const RECOVERY_STORAGE_PREFIX = 'taskflow.tasks.recovery.v1.'
const browserStorageProvider = () => window.localStorage

function makeProtectedState(kind, rawValue, message) {
  return {
    source: 'protected',
    kind,
    rawValue,
    tasks: [],
    persistenceStatus: 'protected',
    storageMessage: message,
  }
}

export function readStoredTasks(storageProvider = () => window.localStorage) {
  let storage
  let rawValue
  try {
    storage = typeof storageProvider === 'function' ? storageProvider() : storageProvider
    rawValue = storage.getItem(TASK_STORAGE_KEY)
  } catch {
    return {
      source: 'unavailable',
      tasks: [],
      persistenceStatus: 'unavailable',
      storageMessage: 'Browser storage could not be read. Task changes are disabled until storage is accessible again.',
    }
  }

  if (rawValue === null) {
    return {
      source: 'missing',
      tasks: createSampleTasks(),
      persistenceStatus: 'initializing',
      storageMessage: 'Saving starter tasks in this browser…',
    }
  }

  let parsed
  try {
    parsed = JSON.parse(rawValue)
  } catch {
    return makeProtectedState('malformed', rawValue, 'Saved task data is malformed and has been protected. Resetting it may discard locally stored data.')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('version' in parsed)) {
    return makeProtectedState('invalid', rawValue, 'Saved task data has an invalid structure and has been protected. Resetting it may discard locally stored data.')
  }
  if (parsed.version !== 1) {
    return makeProtectedState('unsupported', rawValue, `Saved task data uses unsupported version ${String(parsed.version)} and has been protected. Resetting it may discard locally stored data.`)
  }
  if (!Array.isArray(parsed.tasks)) {
    return makeProtectedState('invalid', rawValue, 'Saved task data has an invalid task collection and has been protected. Resetting it may discard locally stored data.')
  }

  const tasks = parsed.tasks.map(normalizeTask)
  if (tasks.some((task) => task === null) || new Set(tasks.map((task) => task.id)).size !== tasks.length) {
    return makeProtectedState('invalid', rawValue, 'One or more saved tasks are invalid and the full collection has been protected. Resetting it may discard locally stored data.')
  }

  return {
    source: 'ready',
    tasks,
    persistenceStatus: 'saved',
    storageMessage: '',
  }
}

function serializeTasks(tasks) {
  return JSON.stringify({ version: 1, tasks })
}

function resolveStorage(storageProvider) {
  return typeof storageProvider === 'function' ? storageProvider() : storageProvider
}

export function seedStoredTasksIfMissing(storageProvider, tasks) {
  let storage
  try {
    storage = resolveStorage(storageProvider)
  } catch {
    return readStoredTasks(storageProvider)
  }

  const current = readStoredTasks(storage)
  if (current.source !== 'missing') return current

  try {
    storage.setItem(TASK_STORAGE_KEY, serializeTasks(tasks))
    return { source: 'ready', tasks, persistenceStatus: 'saved', storageMessage: '' }
  } catch {
    return {
      source: 'ready',
      tasks,
      persistenceStatus: 'unsaved',
      storageMessage: 'Starter tasks are available in this tab but could not be saved in browser storage. Retry saving.',
    }
  }
}

export function persistStoredTasks(storageProvider, tasks) {
  try {
    resolveStorage(storageProvider).setItem(TASK_STORAGE_KEY, serializeTasks(tasks))
    return true
  } catch {
    return false
  }
}

export function backupAndResetStoredTasks(storageProvider, rawValue) {
  let recoveryKey
  let backupCreated = false
  try {
    const storage = resolveStorage(storageProvider)
    if (storage.getItem(TASK_STORAGE_KEY) !== rawValue) return { ok: false, reason: 'changed' }

    const suffix = Date.now()
    recoveryKey = `${RECOVERY_STORAGE_PREFIX}${suffix}`
    let collision = 1
    while (storage.getItem(recoveryKey) !== null) {
      recoveryKey = `${RECOVERY_STORAGE_PREFIX}${suffix}.${collision}`
      collision += 1
    }
    storage.setItem(recoveryKey, rawValue)
    backupCreated = true
    storage.setItem(TASK_STORAGE_KEY, serializeTasks([]))
    return { ok: true, recoveryKey }
  } catch {
    return { ok: false, reason: backupCreated ? 'reset' : 'backup', recoveryKey }
  }
}

export default function useTasks(storageProvider = browserStorageProvider) {
  const [state, setState] = useState(() => readStoredTasks(storageProvider))

  useEffect(() => {
    if (state.source !== 'missing') return undefined

    let active = true
    queueMicrotask(() => {
      if (!active) return
      const result = seedStoredTasksIfMissing(storageProvider, state.tasks)
      setState((current) => current.source === 'missing' ? result : current)
    })

    return () => {
      active = false
    }
  }, [state.source, state.tasks, storageProvider])

  function updateTasks(nextTasks) {
    if (state.source !== 'ready' || state.persistenceStatus !== 'saved') return { accepted: false, persisted: false }

    if (persistStoredTasks(storageProvider, nextTasks)) {
      setState({
        source: 'ready',
        tasks: nextTasks,
        persistenceStatus: 'saved',
        storageMessage: '',
      })
      return { accepted: true, persisted: true }
    } else {
      setState({
        source: 'ready',
        tasks: nextTasks,
        persistenceStatus: 'unsaved',
        storageMessage: 'Changes are available in this tab but were not saved in browser storage. Retry saving before leaving.',
      })
      return { accepted: true, persisted: false }
    }
  }

  function retryPersistence() {
    if (state.source === 'unavailable') {
      setState(readStoredTasks(storageProvider))
      return
    }
    if (state.source !== 'ready' || state.persistenceStatus !== 'unsaved') return

    if (persistStoredTasks(storageProvider, state.tasks)) {
      setState({ ...state, persistenceStatus: 'saved', storageMessage: '' })
    } else {
      setState({
        ...state,
        storageMessage: 'Browser storage is still unavailable. Changes remain unsaved in this tab.',
      })
    }
  }

  function recoverProtectedData() {
    if (state.source !== 'protected' || typeof state.rawValue !== 'string') return false

    const result = backupAndResetStoredTasks(storageProvider, state.rawValue)
    if (result.ok) {
      setState({
        source: 'ready',
        tasks: [],
        persistenceStatus: 'saved',
        storageMessage: `Task data was reset. A raw recovery copy is stored in this browser under ${result.recoveryKey}.`,
      })
      return true
    }

    const storageMessage = result.reason === 'changed'
      ? 'Stored data changed since it was loaded. Reload before attempting recovery; no data was replaced.'
      : result.reason === 'reset'
        ? `Reset did not complete. The original task data was left in place; a recovery copy may exist under ${result.recoveryKey}. Check browser storage availability.`
        : 'Reset did not complete. The original task data was left in place because a recovery copy could not be created.'
    setState({ ...state, storageMessage })
    return false
  }

  return {
    tasks: state.tasks,
    updateTasks,
    persistenceStatus: state.persistenceStatus,
    storageMessage: state.storageMessage,
    isProtected: state.source === 'protected',
    canReset: state.source === 'protected' && typeof state.rawValue === 'string',
    canMutate: state.source === 'ready' && state.persistenceStatus === 'saved',
    retryPersistence,
    recoverProtectedData,
  }
}