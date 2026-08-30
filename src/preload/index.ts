import { contextBridge, ipcRenderer } from 'electron'

const SEND_CHANNELS = new Set([
  'sync-tray',
  'update-setting',
  'update-shortcut',
  'reset-settings',
  'move-camera-window',
  'resize-camera-window',
  'set-ignore-mouse-events',
  'recording-chunk',
  'recording-started',
  'recording-stopped',
  'recording-permission-denied'
])

const INVOKE_CHANNELS = new Set([
  'get-initial-state',
  'get-shortcuts',
  'check-media-permission',
  'check-screen-permission',
  'open-system-settings',
  'choose-recording-folder',
  'recording-start',
  'recording-stop'
])

const ON_CHANNELS = new Set([
  'tray-action',
  'settings-reset',
  'power-state',
  'sync-setting',
  'sync-language',
  'set-camera-position',
  'screen-changed',
  'start-recording',
  'stop-recording',
  'recording-permission-denied'
])

function isAllowed(channel: string, set: Set<string>): boolean {
  return set.has(channel)
}

function createIpcRendererBridge(): {
  send: (channel: string, ...args: unknown[]) => void
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => () => void
  once: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => () => void
  removeListener: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void
  removeAllListeners: (channel?: string) => void
} {
  return {
    send: (channel, ...args) => {
      if (!isAllowed(channel, SEND_CHANNELS)) {
        console.warn(`[preload] blocked ipcRenderer.send on channel: ${channel}`)
        return
      }
      ipcRenderer.send(channel, ...args)
    },
    invoke: (channel, ...args) => {
      if (!isAllowed(channel, INVOKE_CHANNELS)) {
        console.warn(`[preload] blocked ipcRenderer.invoke on channel: ${channel}`)
        return Promise.reject(new Error(`Blocked IPC invoke: ${channel}`))
      }
      return ipcRenderer.invoke(channel, ...args)
    },
    on: (channel, listener) => {
      if (!isAllowed(channel, ON_CHANNELS)) {
        console.warn(`[preload] blocked ipcRenderer.on on channel: ${channel}`)
        return () => {}
      }
      ipcRenderer.on(channel, listener)
      return () => {
        ipcRenderer.removeListener(channel, listener)
      }
    },
    once: (channel, listener) => {
      if (!isAllowed(channel, ON_CHANNELS)) {
        console.warn(`[preload] blocked ipcRenderer.once on channel: ${channel}`)
        return () => {}
      }
      ipcRenderer.once(channel, listener)
      return () => {
        ipcRenderer.removeListener(channel, listener)
      }
    },
    removeListener: (channel, listener) => {
      if (isAllowed(channel, ON_CHANNELS)) {
        ipcRenderer.removeListener(channel, listener)
      }
    },
    removeAllListeners: (channel) => {
      if (!channel || isAllowed(channel, ON_CHANNELS)) {
        ipcRenderer.removeAllListeners(channel)
      }
    }
  }
}

const electronApi = { ipcRenderer: createIpcRendererBridge() }

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronApi)
    contextBridge.exposeInMainWorld('api', {})
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (defined in index.d.ts)
  window.electron = electronApi
  // @ts-ignore (defined in index.d.ts)
  window.api = {}
}
