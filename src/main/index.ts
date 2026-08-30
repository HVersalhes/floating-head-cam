import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  screen,
  session,
  systemPreferences,
  desktopCapturer,
  shell
} from 'electron'
import { autoUpdater } from 'electron-updater'
import { getIsCameraOn, setIsCameraOn } from './domains/camera/camera.service'
import { t } from '../shared/i18n'
import {
  currentState,
  defaultShortcuts,
  loadSettings,
  resetToDefaults,
  saveSettings,
  shortcuts
} from './domains/settings/settings.service'
import {
  registerGlobalShortcuts,
  unregisterGlobalShortcuts
} from './domains/shortcuts/shortcuts.service'
import { buildTrayMenu, initTray, setUpdateReady, toggleCamera } from './domains/tray/tray.service'
import { showCountdown } from './domains/recording/countdown.service'
import {
  createWindow,
  getSettingsWindow,
  setWindowPosition,
  getRecordingWorker,
  createRecordingWorker,
  moveCameraToScreen,
  moveCameraWindow,
  resizeCameraWindow,
  getCameraWindow
} from './domains/window/window.service'
import { setupRecordingIPC, setOnRecordingAborted } from './domains/recording/recording.service'
import {
  ACCELERATOR_PATTERN,
  WINDOW_POSITIONS,
  isBoundedNumber,
  isObject,
  sanitizeDevices,
  settingValidators,
  trayValidators
} from './ipc-validation'

function isRecordingWorkerSender(sender: Electron.WebContents): boolean {
  const worker = getRecordingWorker()
  return Boolean(worker && sender.id === worker.webContents.id)
}
function isCameraWindowSender(sender: Electron.WebContents): boolean {
  const win = getCameraWindow()
  return Boolean(win && sender.id === win.webContents.id)
}

const windowCallbacks = {
  onFocus: (win: BrowserWindow) => {
    registerGlobalShortcuts(win)
  },
  onBlur: () => {
    unregisterGlobalShortcuts()
  }
}

function buildRecordingPayload(): {
  resolution: string
  fps: string
  encoder: string
  systemAudioVolume: number
  microphoneAudioVolume: number
  selectedMicrophoneId: string
} {
  return {
    resolution: currentState.recordingResolution,
    fps: currentState.recordingFps,
    encoder: currentState.recordingEncoder || 'libx264',
    systemAudioVolume: currentState.systemAudioVolume ?? 50,
    microphoneAudioVolume: currentState.microphoneAudioVolume ?? 100,
    selectedMicrophoneId: currentState.selectedMicrophoneId || 'default'
  }
}

let isRecordingFlowInFlight = false
async function startRecordingFlow(): Promise<void> {
  if (isRecordingFlowInFlight) return
  isRecordingFlowInFlight = true
  try {
    if (!currentState.isRecording) {
      await showCountdown()
    }
    const worker = getRecordingWorker()
    if (worker && worker.webContents) {
      worker.webContents.send(
        currentState.isRecording ? 'stop-recording' : 'start-recording',
        buildRecordingPayload()
      )
    }
  } finally {
    isRecordingFlowInFlight = false
  }
}

app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('force-color-profile', 'srgb')
if (process.env.FHC_SAFE_GPU === '1') {
  app.disableHardwareAcceleration()
}
if (process.platform === 'win32') {
  // app.disableHardwareAcceleration() // Disabled for performance with Cam Link
}
app.whenReady().then(() => {
  const loginSettings = app.getLoginItemSettings()
  if (loginSettings.wasOpenedAtLogin) {
    setIsCameraOn(false)
  } else {
    setIsCameraOn(true)
  }
  loadSettings()
  currentState.isRecording = false
  saveSettings()
  if (process.platform === 'darwin') {
    app.dock?.hide()
    app.setLoginItemSettings({ openAtLogin: false, openAsHidden: false })
  }
  const allowedPermissions = new Set(['media', 'display-capture'])
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) =>
    callback(allowedPermissions.has(permission))
  )
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) =>
    allowedPermissions.has(permission)
  )
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => {
          if (!sources.length) {
            callback({})
            return
          }
          const primaryDisplay = screen.getPrimaryDisplay()
          let targetSource = sources.find(
            (s) => s.display_id === String(currentState.recordingScreenId)
          )
          if (!targetSource) {
            targetSource =
              sources.find((s) => s.display_id === String(primaryDisplay.id)) ?? sources[0]
          }
          if (process.platform === 'darwin' || process.platform === 'win32') {
            callback({ video: targetSource, audio: 'loopback' })
          } else {
            callback({ video: targetSource })
          }
        })
        .catch((err) => {
          console.error('Error getting sources in setDisplayMediaRequestHandler:', err)
          callback({})
        })
    },
    { useSystemPicker: false }
  )

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const contentSecurityPolicy = is.dev
      ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws:"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy]
      }
    })
  })
  electronApp.setAppUserModelId('com.electron.app')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  app.on('web-contents-created', (_, webContents) => {
    webContents.on('before-input-event', (event, input) => {
      if (
        input.key === 'F12' ||
        (input.control && input.shift && input.key.toLowerCase() === 'i') ||
        (input.meta && input.shift && input.key.toLowerCase() === 'i')
      ) {
        event.preventDefault()
      }
    })
  })
  initTray()
  buildTrayMenu(currentState)
  if (shortcuts.toggleCamera) {
    globalShortcut.register(shortcuts.toggleCamera, () => toggleCamera(currentState))
  }
  if (shortcuts.startRecording) {
    globalShortcut.register(shortcuts.startRecording, () => startRecordingFlow())
  }
  autoUpdater.on('update-downloaded', () => {
    setUpdateReady(true)
    buildTrayMenu(currentState)
  })
  if (app.isPackaged && (process.platform !== 'linux' || process.env.APPIMAGE)) {
    autoUpdater.checkForUpdates().catch((err: unknown) => {
      console.warn('Auto-update check failed:', err instanceof Error ? err.message : err)
    })
  }
  const allowedSyncTrayKeys = new Set([
    'devices',
    'selectedDeviceId',
    'isMirrored',
    'shape',
    'borderGradient',
    'borderWidth',
    'isBorderAnimated',
    'sizeIndex',
    'rounding',
    'alwaysOnTop',
    'language',
    'cameraScreenId',
    'x',
    'y',
    'sidebarWidthPercentage',
    'sidebarPosition'
  ])
  ipcMain.on('sync-tray', (_, payload) => {
    if (!isObject(payload)) return
    for (const key of Object.keys(payload)) {
      if (!allowedSyncTrayKeys.has(key)) continue
      if (key === 'devices') {
        const devices = sanitizeDevices(payload[key])
        if (devices) currentState.devices = devices
        continue
      }
      const validator = trayValidators[key]
      const value = payload[key]
      if (validator && validator(value)) {
        currentState[key] = value
      }
    }
    saveSettings()
    buildTrayMenu(currentState)
    const sw = getSettingsWindow()
    if (sw && (payload.language === 'en' || payload.language === 'pt')) {
      sw.setTitle(t('tray.preferences', payload.language).replace('...', ''))
    }
  })

  const allowedSettingKeys = new Set([
    'shape',
    'rounding',
    'borderGradient',
    'borderWidth',
    'isBorderAnimated',
    'recordingFolder',
    'recordingResolution',
    'recordingFps',
    'recordingEncoder',
    'systemAudioVolume',
    'microphoneAudioVolume',
    'selectedMicrophoneId',
    'cameraScreenId',
    'recordingScreenId',
    'sidebarWidthPercentage',
    'sidebarPosition'
  ])
  ipcMain.on('update-setting', (_, payload) => {
    if (!isObject(payload)) return
    const { key, value } = payload
    if (typeof key !== 'string' || !allowedSettingKeys.has(key)) return
    const validator = settingValidators[key]
    if (!validator || !validator(value)) return
    currentState[key] = value
    saveSettings()
    buildTrayMenu(currentState)
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('sync-setting', { key, value })

      if (key === 'shape') {
        win.webContents.send('tray-action', { type: 'set-shape', payload: value })
      } else if (key === 'rounding') {
        win.webContents.send('tray-action', { type: 'set-rounding', payload: value })
      } else if (key === 'borderGradient') {
        win.webContents.send('tray-action', { type: 'set-border-gradient', payload: value })
      } else if (key === 'borderWidth') {
        win.webContents.send('tray-action', { type: 'set-border-width', payload: value })
      } else if (key === 'isBorderAnimated') {
        win.webContents.send('tray-action', { type: 'set-border-animated', payload: value })
      } else if (key === 'sidebarWidthPercentage') {
        win.webContents.send('tray-action', { type: 'set-sidebar-width', payload: value })
      } else if (key === 'sidebarPosition') {
        win.webContents.send('tray-action', { type: 'set-sidebar-position', payload: value })
      }
    })

    if (key === 'cameraScreenId') {
      moveCameraToScreen(value as string)
    }
  })
  ipcMain.handle('choose-recording-folder', async () => {
    const result = await dialog.showOpenDialog(getSettingsWindow() as BrowserWindow, {
      title: t('settings.recordingFolder', currentState.language || 'en'),
      defaultPath:
        typeof currentState.recordingFolder === 'string' && currentState.recordingFolder
          ? currentState.recordingFolder
          : app.getPath('videos'),
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.on('set-window-position', (_, pos) => {
    if (typeof pos !== 'string' || !WINDOW_POSITIONS.has(pos)) return
    setWindowPosition(pos)
  })
  function setRecordingState(isRecording: boolean): void {
    currentState.isRecording = isRecording
    saveSettings()
    buildTrayMenu(currentState)
    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.send('sync-setting', { key: 'isRecording', value: isRecording })
    )
  }

  ipcMain.on('recording-started', (event) => {
    if (isRecordingWorkerSender(event.sender)) setRecordingState(true)
  })

  ipcMain.on('recording-stopped', (event) => {
    if (isRecordingWorkerSender(event.sender)) setRecordingState(false)
  })

  ipcMain.on('recording-permission-denied', (event, payload) => {
    if (!isRecordingWorkerSender(event.sender)) return
    setRecordingState(false)
    BrowserWindow.getAllWindows().forEach((w) => {
      if (w !== getRecordingWorker()) {
        w.webContents.send('recording-permission-denied', payload)
      }
    })
  })

  setOnRecordingAborted(() => setRecordingState(false))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(app as any).on('tray-toggle-recording', () => startRecordingFlow())

  ipcMain.handle('get-initial-state', () => ({ ...currentState, isCameraOn: getIsCameraOn() }))
  ipcMain.handle('get-shortcuts', () => shortcuts)
  ipcMain.handle('check-media-permission', async (_, mediaType: 'camera' | 'microphone') => {
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus(mediaType)
      if (status === 'granted') return 'granted'
      const success = await systemPreferences.askForMediaAccess(mediaType)
      return success ? 'granted' : 'denied'
    }
    return 'granted'
  })

  ipcMain.handle('check-screen-permission', async () => {
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('screen')
      if (status !== 'granted') {
        try {
          await desktopCapturer.getSources({ types: ['screen'] })
        } catch {
          return systemPreferences.getMediaAccessStatus('screen')
        }
        return systemPreferences.getMediaAccessStatus('screen')
      }
      return status
    }
    return 'granted'
  })

  ipcMain.handle('open-system-settings', async (_, type: 'camera' | 'microphone' | 'screen') => {
    try {
      if (process.platform === 'darwin') {
        if (type === 'camera')
          shell.openExternal(
            'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera'
          )
        else if (type === 'microphone')
          shell.openExternal(
            'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
          )
        else if (type === 'screen')
          shell.openExternal(
            'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
          )
      } else if (process.platform === 'win32') {
        if (type === 'camera') shell.openExternal('ms-settings:privacy-webcam')
        else if (type === 'microphone') shell.openExternal('ms-settings:privacy-microphone')
      }
    } catch (err) {
      console.error('[main] failed to open system settings:', err)
    }
  })

  ipcMain.on('update-shortcut', (_, key, value) => {
    if (typeof key !== 'string' || !(key in defaultShortcuts)) return
    if (typeof value !== 'string' || !value) return
    if (!ACCELERATOR_PATTERN.test(value)) return
    shortcuts[key] = value
    saveSettings()
    buildTrayMenu(currentState)
    const floatingHead = getCameraWindow()
    if (floatingHead) {
      globalShortcut.unregisterAll()
      if (shortcuts.toggleCamera) {
        globalShortcut.register(shortcuts.toggleCamera, () => toggleCamera(currentState))
      }
      if (shortcuts.startRecording) {
        globalShortcut.register(shortcuts.startRecording, () => startRecordingFlow())
      }
      if (floatingHead.isFocused()) {
        registerGlobalShortcuts(floatingHead)
      }
    }
  })
  ipcMain.on('reset-settings', (_, tab) => {
    resetToDefaults(tab)
    saveSettings()
    buildTrayMenu(currentState)
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('settings-reset', { shortcuts, state: currentState })
    })
  })

  setupRecordingIPC()

  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    if (process.platform === 'linux') return
    if (typeof ignore !== 'boolean') return
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    const opts =
      isObject(options) && typeof options.forward === 'boolean'
        ? { forward: options.forward }
        : undefined
    win.setIgnoreMouseEvents(ignore, opts)
  })

  ipcMain.on('move-camera-window', (event, x, y) => {
    if (!isCameraWindowSender(event.sender)) return
    if (!isBoundedNumber(x, -100000, 100000) || !isBoundedNumber(y, -100000, 100000)) return
    moveCameraWindow(x, y)
  })

  ipcMain.on('resize-camera-window', (event, width, height, x, y) => {
    if (!isCameraWindowSender(event.sender)) return
    if (!isBoundedNumber(width, 50, 20000) || !isBoundedNumber(height, 50, 20000)) return
    if (x !== undefined && !isBoundedNumber(x, -100000, 100000)) return
    if (y !== undefined && !isBoundedNumber(y, -100000, 100000)) return
    resizeCameraWindow(width, height, x, y)
  })

  createWindow(windowCallbacks)
  createRecordingWorker()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(windowCallbacks)
    }
  })
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
