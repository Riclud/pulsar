/**
 * Which permission grants a built-in capability. Names are stable and appear
 * in `pulsar.json`; custom capabilities registered by an app are not listed and
 * are therefore never gated.
 */
export const CAPABILITY_PERMISSIONS: Record<string, string> = {
  "fs.readFile": "fs",
  "fs.writeFile": "fs",
  "fs.appendFile": "fs",
  "fs.listDir": "fs",
  "fs.exists": "fs",
  "fs.stat": "fs",
  "fs.mkdir": "fs",
  "fs.remove": "fs",
  "fs.rename": "fs",
  "fs.copy": "fs",
  "fs.moveToTrash": "fs",
  "fs.exportTo": "fs",
  "fs.open": "fs",
  "nw.fetch": "net",
  "nw.request": "net",
  "nw.websocket": "net",
  "nw.abort": "net",
  "paths.get": "paths",
  "shell.open": "shell",
  "shell.notify": "notify",
  "dialog.openFile": "dialog",
  "dialog.openFiles": "dialog",
  "dialog.openDirectory": "dialog",
  "dialog.saveFile": "dialog",
  "dialog.message": "dialog",
  "dialog.color": "dialog",
  "dialog.toast": "dialog",
  "screen.list": "screen",
  "theme.get": "theme",
  "theme.set": "theme",
  "system.locale": "system",
  "system.power": "system",
  "storage.get": "storage",
  "storage.has": "storage",
  "storage.set": "storage",
  "storage.remove": "storage",
  "secure.available": "secure",
  "secure.get": "secure",
  "secure.set": "secure",
  "secure.remove": "secure",
  "clipboard.read": "clipboard",
  "clipboard.write": "clipboard",
  share: "share",
  "device.orientation": "device",
  "device.keepAwake": "device",
  "permissions.request": "permissions",
  "permissions.check": "permissions",
  "notification.channel": "notify",
  media: "media",
  "fs.watch": "fs",
  "fs.unwatch": "fs",
  tray: "tray",
}

/** The permission a built-in capability needs, or null when it is never gated. */
export const capabilityPermission = (name: string): string | null => {
  return CAPABILITY_PERMISSIONS[name] ?? null
}

/**
 * Build the gate for a manifest. An absent `permissions` field disables the
 * gate entirely (everything allowed); a present one allows only its entries.
 * The returned function throws for a denied capability.
 */
export const createPermissionGate = (permissions: string[] | undefined): ((name: string) => void) | null => {
  if (permissions === undefined) return null

  const granted = new Set(permissions)

  return (name: string): void => {
    const permission = CAPABILITY_PERMISSIONS[name]

    if (!permission || granted.has(permission)) return

    throw new Error(`permission denied: ${name} (add "${permission}" to permissions in pulsar.json)`)
  }
}
