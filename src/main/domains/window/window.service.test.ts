import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSettingsWindow, setWindowPosition } from './window.service'
const { mockWebContentsSend } = vi.hoisted(() => ({
  mockWebContentsSend: vi.fn()
}))
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock'),
    focus: vi.fn(),
    dock: { hide: vi.fn() },
    setLoginItemSettings: vi.fn()
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [
      {
        webContents: {
          send: mockWebContentsSend
        }
      }
    ])
  },
  screen: {},
  shell: { openExternal: vi.fn() }
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
vi.mock('../../../../resources/icon.png?asset', () => ({ default: '/mock/icon.png' }))
vi.mock('../settings/settings.service', () => ({
  currentState: {
    x: undefined,
    y: undefined,
    shape: 'circle',
    sizeIndex: 0,
    alwaysOnTop: true,
    cameraScreenId: ''
  },
  saveSettings: vi.fn()
}))
vi.mock('../camera/camera.service', () => ({ getIsCameraOn: vi.fn(() => false) }))
describe('window.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  describe('getSettingsWindow', () => {
    it('returns null before any window is created', () => {
      expect(getSettingsWindow()).toBeNull()
    })
  })
  describe('setWindowPosition', () => {
    it('sends IPC message to renderer', () => {
      setWindowPosition('top-left')
      expect(mockWebContentsSend).toHaveBeenCalledWith('set-camera-position', 'top-left')
    })
  })
})
