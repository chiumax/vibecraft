/**
 * VersionBanner - React component that checks for updates and shows a banner
 *
 * Compares the local server version (from /health) with the latest version
 * (from version.json). Shows a non-intrusive banner if an update is available.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../../stores'

interface VersionInfo {
  latest: string
  minSupported: string
  releaseUrl: string
  updateCommand: string
}

interface HealthResponse {
  ok: boolean
  version: string
  clients: number
  events: number
}

interface BannerState {
  visible: boolean
  currentVersion: string
  versionInfo: VersionInfo | null
  isUnsupported: boolean
  copied: boolean
}

/**
 * Compare semantic versions. Returns:
 *  -1 if a < b
 *   0 if a === b
 *   1 if a > b
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number)
  const partsB = b.split('.').map(Number)

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0
    const numB = partsB[i] || 0
    if (numA < numB) return -1
    if (numA > numB) return 1
  }
  return 0
}

export function VersionBanner() {
  const connected = useAppStore((s) => s.connected)
  const [state, setState] = useState<BannerState>({
    visible: false,
    currentVersion: '',
    versionInfo: null,
    isUnsupported: false,
    copied: false,
  })

  const checkForUpdates = useCallback(async () => {
    // Test modes for development
    const params = new URLSearchParams(window.location.search)
    if (params.has('testUpdate') || params.has('testUpdateCritical')) {
      const isCritical = params.has('testUpdateCritical')
      const fakeVersionInfo: VersionInfo = {
        latest: '99.0.0',
        minSupported: isCritical ? '99.0.0' : '0.1.0',
        releaseUrl: 'https://github.com/nearcyan/vibecraft/releases',
        updateCommand: 'npx vibecraft@latest setup',
      }
      console.log(`[VersionBanner] Test mode: ${isCritical ? 'critical' : 'update'} banner`)
      setState({
        visible: true,
        currentVersion: '0.1.0',
        versionInfo: fakeVersionInfo,
        isUnsupported: isCritical,
        copied: false,
      })
      return
    }

    try {
      // Get server version
      const healthRes = await fetch('/health')
      if (!healthRes.ok) return

      const health: HealthResponse = await healthRes.json()
      const serverVersion = health.version

      if (!serverVersion || serverVersion === 'unknown') {
        console.log('[VersionBanner] Server version unknown, skipping check')
        return
      }

      // Get latest version info from static site
      const versionRes = await fetch('/version.json')
      if (!versionRes.ok) {
        console.log('[VersionBanner] Could not fetch version.json')
        return
      }

      const versionInfo: VersionInfo = await versionRes.json()

      // Compare versions
      const comparison = compareVersions(serverVersion, versionInfo.latest)

      if (comparison < 0) {
        // Server is outdated
        const isUnsupported = compareVersions(serverVersion, versionInfo.minSupported) < 0
        setState({
          visible: true,
          currentVersion: serverVersion,
          versionInfo,
          isUnsupported,
          copied: false,
        })
      } else {
        console.log(`[VersionBanner] Up to date (v${serverVersion})`)
      }
    } catch (err) {
      // Silently fail - version check is not critical
      console.log('[VersionBanner] Check failed:', err)
    }
  }, [])

  // Check for updates when connected
  useEffect(() => {
    if (connected) {
      checkForUpdates()
    }
  }, [connected, checkForUpdates])

  const handleDismiss = useCallback(() => {
    setState((s) => ({ ...s, visible: false }))
  }, [])

  const handleCopyCommand = useCallback(() => {
    if (!state.versionInfo) return
    navigator.clipboard.writeText(state.versionInfo.updateCommand)
    setState((s) => ({ ...s, copied: true }))
    setTimeout(() => {
      setState((s) => ({ ...s, copied: false }))
    }, 1500)
  }, [state.versionInfo])

  if (!state.visible || !state.versionInfo) {
    return null
  }

  const icon = state.isUnsupported ? '\u26A0\uFE0F' : '\u2728'
  const title = state.isUnsupported ? 'Update Required' : 'Update Available'
  const message = state.isUnsupported
    ? `Your version (${state.currentVersion}) is no longer supported.`
    : `A new version is available: ${state.versionInfo.latest} (you have ${state.currentVersion})`

  return (
    <div className={`version-banner ${state.isUnsupported ? 'version-banner-critical' : ''}`}>
      <div className="version-banner-content">
        <span className="version-banner-icon">{icon}</span>
        <span className="version-banner-text">
          <strong>{title}</strong> - {message}
        </span>
        <code
          className="version-banner-command"
          onClick={handleCopyCommand}
          title="Click to copy"
        >
          {state.copied ? 'Copied!' : state.versionInfo.updateCommand}
        </code>
        <a
          href={state.versionInfo.releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="version-banner-link"
        >
          Release Notes
        </a>
        <button
          className="version-banner-dismiss"
          onClick={handleDismiss}
          title="Dismiss"
        >
          &times;
        </button>
      </div>
    </div>
  )
}
