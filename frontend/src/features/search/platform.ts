/** Platform detection for shortcut labels and platform-specific hints. */

export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
}

/** ⌘K on Apple platforms, Ctrl K elsewhere. */
export function searchShortcutLabel(): string {
  return isApplePlatform() ? '⌘K' : 'Ctrl K'
}

/** ⌘, on Apple platforms, Ctrl , elsewhere. */
export function settingsShortcutLabel(): string {
  return isApplePlatform() ? '⌘,' : 'Ctrl ,'
}
