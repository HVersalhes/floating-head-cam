export const SHAPES = new Set(['circle', 'square', 'vertical-rect', 'horizontal-rect'])
export const RESOLUTIONS = new Set(['720p', '1080p', '1440p', '2160p'])
export const FPS_VALUES = new Set(['30', '60'])
export const ENCODERS = new Set([
  'libx264',
  'h264_nvenc',
  'h264_qsv',
  'h264_amf',
  'h264_videotoolbox'
])
export const WINDOW_POSITIONS = new Set([
  'top-left',
  'top-right',
  'left-middle',
  'center',
  'right-middle',
  'bottom-left',
  'bottom-right'
])
export const ACCELERATOR_PATTERN = /^[A-Za-z0-9+ ]{1,50}$/

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
export function isBool(v: unknown): v is boolean {
  return typeof v === 'boolean'
}
export function isBoundedNumber(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
}
export function isBoundedInt(v: unknown, min: number, max: number): v is number {
  return isBoundedNumber(v, min, max) && Number.isInteger(v)
}
export function isShortString(v: unknown, max = 512): v is string {
  return typeof v === 'string' && v.length <= max
}

export interface SanitizedDevice {
  deviceId: string
  label: string
}

export function sanitizeDevices(v: unknown): SanitizedDevice[] | null {
  if (!Array.isArray(v) || v.length > 200) return null
  const out: SanitizedDevice[] = []
  for (const d of v) {
    if (!isObject(d) || !isShortString(d.deviceId, 200)) continue
    out.push({
      deviceId: d.deviceId,
      label: typeof d.label === 'string' ? d.label.slice(0, 200) : ''
    })
  }
  return out
}

export const trayValidators: Record<string, (v: unknown) => boolean> = {
  selectedDeviceId: (v) => isShortString(v, 200),
  isMirrored: isBool,
  shape: (v) => isShortString(v) && SHAPES.has(v),
  borderGradient: (v) => isShortString(v, 512),
  borderWidth: (v) => isBoundedNumber(v, 0, 50),
  isBorderAnimated: isBool,
  sizeIndex: (v) => isBoundedInt(v, 0, 4),
  rounding: (v) => isBoundedInt(v, 0, 9999),
  alwaysOnTop: isBool,
  language: (v) => v === 'en' || v === 'pt',
  cameraScreenId: (v) => isShortString(v, 40),
  x: (v) => isBoundedNumber(v, -100000, 100000),
  y: (v) => isBoundedNumber(v, -100000, 100000),
  sidebarWidthPercentage: (v) => isBoundedInt(v, 10, 90),
  sidebarPosition: (v) => v === 'left' || v === 'right'
}

export const settingValidators: Record<string, (v: unknown) => boolean> = {
  shape: (v) => isShortString(v) && SHAPES.has(v),
  rounding: (v) => isBoundedInt(v, 0, 9999),
  borderGradient: (v) => isShortString(v, 512),
  borderWidth: (v) => isBoundedNumber(v, 0, 50),
  isBorderAnimated: isBool,
  recordingFolder: (v) => isShortString(v, 1024),
  recordingResolution: (v) => isShortString(v, 8) && RESOLUTIONS.has(v),
  recordingFps: (v) => isShortString(v, 4) && FPS_VALUES.has(v),
  recordingEncoder: (v) => isShortString(v, 32) && ENCODERS.has(v),
  systemAudioVolume: (v) => isBoundedInt(v, 0, 100),
  microphoneAudioVolume: (v) => isBoundedInt(v, 0, 100),
  selectedMicrophoneId: (v) => isShortString(v, 200),
  cameraScreenId: (v) => isShortString(v, 40),
  recordingScreenId: (v) => isShortString(v, 40),
  sidebarWidthPercentage: (v) => isBoundedInt(v, 10, 90),
  sidebarPosition: (v) => v === 'left' || v === 'right'
}
