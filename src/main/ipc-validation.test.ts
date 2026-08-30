import { describe, it, expect } from 'vitest'
import {
  ACCELERATOR_PATTERN,
  settingValidators,
  trayValidators,
  sanitizeDevices,
  isBoundedInt,
  isBoundedNumber,
  isShortString
} from './ipc-validation'

describe('settingValidators', () => {
  it('accepts rounding values used by the UI (0, 24 and 9999 sentinel)', () => {
    expect(settingValidators.rounding(0)).toBe(true)
    expect(settingValidators.rounding(24)).toBe(true)
    expect(settingValidators.rounding(9999)).toBe(true)
  })

  it('rejects out-of-range or non-integer rounding', () => {
    expect(settingValidators.rounding(-1)).toBe(false)
    expect(settingValidators.rounding(10001)).toBe(false)
    expect(settingValidators.rounding(24.5)).toBe(false)
    expect(settingValidators.rounding('24')).toBe(false)
  })

  it('accepts only known recording resolutions', () => {
    expect(settingValidators.recordingResolution('720p')).toBe(true)
    expect(settingValidators.recordingResolution('2160p')).toBe(true)
    expect(settingValidators.recordingResolution('4k')).toBe(false)
    expect(settingValidators.recordingResolution('1080p ')).toBe(false)
  })

  it('accepts only 30/60 fps', () => {
    expect(settingValidators.recordingFps('30')).toBe(true)
    expect(settingValidators.recordingFps('60')).toBe(true)
    expect(settingValidators.recordingFps('75')).toBe(false)
    expect(settingValidators.recordingFps(60)).toBe(false)
  })

  it('accepts only the known encoders', () => {
    for (const enc of ['libx264', 'h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_videotoolbox']) {
      expect(settingValidators.recordingEncoder(enc)).toBe(true)
    }
    expect(settingValidators.recordingEncoder('auto')).toBe(false)
    expect(settingValidators.recordingEncoder('libx264; rm -rf /')).toBe(false)
  })

  it('bounds borderWidth numbers and volumes', () => {
    expect(settingValidators.borderWidth(0)).toBe(true)
    expect(settingValidators.borderWidth(20)).toBe(true)
    expect(settingValidators.borderWidth(51)).toBe(false)
    expect(settingValidators.borderWidth(Infinity)).toBe(false)
    expect(settingValidators.systemAudioVolume(100)).toBe(true)
    expect(settingValidators.systemAudioVolume(101)).toBe(false)
    expect(settingValidators.microphoneAudioVolume(15.5)).toBe(false)
  })

  it('rejects unknown keys and non-booleans', () => {
    expect(settingValidators.isBorderAnimated(true)).toBe(true)
    expect(settingValidators.isBorderAnimated('true')).toBe(false)
    expect(settingValidators.isBorderAnimated(1)).toBe(false)
    expect(settingValidators.shape('circle')).toBe(true)
    expect(settingValidators.shape('triangle')).toBe(false)
  })

  it('caps string lengths', () => {
    expect(settingValidators.recordingFolder('x'.repeat(1024))).toBe(true)
    expect(settingValidators.recordingFolder('x'.repeat(1025))).toBe(false)
    expect(settingValidators.borderGradient('x'.repeat(513))).toBe(false)
    expect(settingValidators.cameraScreenId('x'.repeat(41))).toBe(false)
  })
})

describe('trayValidators', () => {
  it('accepts sizeIndex integers 0..4', () => {
    expect(trayValidators.sizeIndex(0)).toBe(true)
    expect(trayValidators.sizeIndex(4)).toBe(true)
    expect(trayValidators.sizeIndex(5)).toBe(false)
    expect(trayValidators.sizeIndex(1.5)).toBe(false)
  })

  it('accepts rounding up to the 9999 sentinel', () => {
    expect(trayValidators.rounding(9999)).toBe(true)
    expect(trayValidators.rounding(10000)).toBe(false)
  })

  it('validates position numbers', () => {
    expect(trayValidators.x(-1920)).toBe(true)
    expect(trayValidators.x(100000)).toBe(true)
    expect(trayValidators.x(100001)).toBe(false)
    expect(trayValidators.y(NaN)).toBe(false)
  })

  it('validates language and sidebar position enums', () => {
    expect(trayValidators.language('en')).toBe(true)
    expect(trayValidators.language('pt')).toBe(true)
    expect(trayValidators.language('fr')).toBe(false)
    expect(trayValidators.sidebarPosition('left')).toBe(true)
    expect(trayValidators.sidebarPosition('right')).toBe(true)
    expect(trayValidators.sidebarPosition('top')).toBe(false)
  })
})

describe('sanitizeDevices', () => {
  it('filters invalid entries instead of rejecting the whole list', () => {
    const result = sanitizeDevices([
      { deviceId: 'cam-1', label: 'Logitech' },
      { deviceId: 'cam-2' },
      'junk',
      { deviceId: 123, label: 'no' }
    ])
    expect(result).toEqual([
      { deviceId: 'cam-1', label: 'Logitech' },
      { deviceId: 'cam-2', label: '' }
    ])
  })

  it('returns null for non-arrays and oversized lists', () => {
    expect(sanitizeDevices('x')).toBeNull()
    expect(sanitizeDevices({})).toBeNull()
    expect(sanitizeDevices(new Array(201).fill({ deviceId: 'a' }))).toBeNull()
  })

  it('caps label length', () => {
    const long = 'x'.repeat(300)
    const result = sanitizeDevices([{ deviceId: 'c', label: long }])
    expect(result?.[0].label).toHaveLength(200)
  })
})

describe('type guards', () => {
  it('guards bounded numbers and ints', () => {
    expect(isBoundedNumber(5, 0, 10)).toBe(true)
    expect(isBoundedNumber('5', 0, 10)).toBe(false)
    expect(isBoundedInt(4, 0, 4)).toBe(true)
    expect(isBoundedInt(4.5, 0, 4)).toBe(false)
    expect(isShortString('abc', 3)).toBe(true)
    expect(isShortString('abcd', 3)).toBe(false)
  })
})

describe('ACCELERATOR_PATTERN', () => {
  it('accepts accelerators generated by the app UI', () => {
    for (const a of ['Alt+Q', 'CmdOrCtrl+D', 'Shift+F9', 'F10', '1', 'Alt+Shift+BracketLeft']) {
      expect(ACCELERATOR_PATTERN.test(a)).toBe(true)
    }
  })

  it('rejects control characters, quotes and semicolons', () => {
    for (const a of ['Ctrl+;', 'x; rm -rf /', 'a"b', 'a`b', `a\nb`, 'a<b', 'AAAAA'.repeat(11)]) {
      expect(ACCELERATOR_PATTERN.test(a)).toBe(false)
    }
  })
})
