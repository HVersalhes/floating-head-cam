/* eslint-disable @typescript-eslint/no-explicit-any */
export type IpcSendChannel =
  | 'sync-tray'
  | 'update-setting'
  | 'update-shortcut'
  | 'reset-settings'
  | 'move-camera-window'
  | 'resize-camera-window'
  | 'set-ignore-mouse-events'
  | 'recording-chunk'
  | 'recording-started'
  | 'recording-stopped'
  | 'recording-permission-denied'

export type IpcInvokeChannel =
  | 'get-initial-state'
  | 'get-shortcuts'
  | 'check-media-permission'
  | 'check-screen-permission'
  | 'open-system-settings'
  | 'choose-recording-folder'
  | 'recording-start'
  | 'recording-stop'

export type IpcReceiveChannel =
  | 'tray-action'
  | 'settings-reset'
  | 'power-state'
  | 'sync-setting'
  | 'sync-language'
  | 'set-camera-position'
  | 'screen-changed'
  | 'start-recording'
  | 'stop-recording'
  | 'recording-permission-denied'

export interface IpcRendererBridge {
  send(channel: IpcSendChannel, ...args: any[]): void
  invoke(channel: IpcInvokeChannel, ...args: any[]): Promise<any>
  on(channel: IpcReceiveChannel, listener: (event: any, ...args: any[]) => void): () => void
  once(channel: IpcReceiveChannel, listener: (event: any, ...args: any[]) => void): () => void
  removeListener(channel: IpcReceiveChannel, listener: (...args: any[]) => void): void
  removeAllListeners(channel?: IpcReceiveChannel): void
}

declare global {
  interface Window {
    electron: { ipcRenderer: IpcRendererBridge }
    api: unknown
  }
}
