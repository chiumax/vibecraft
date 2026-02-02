/**
 * ConnectionUI - Connection status overlays and modals
 *
 * Handles the not-connected overlay, offline banner, about modal,
 * and zone timeout modal.
 */

// ============================================================================
// About Modal
// ============================================================================

export function setupAboutModal(): void {
  const aboutBtn = document.getElementById('about-btn')
  const modal = document.getElementById('about-modal')
  const closeBtn = document.getElementById('about-close')

  if (!modal) return

  // Open modal
  aboutBtn?.addEventListener('click', () => {
    // Fetch and display version
    const versionEl = document.getElementById('about-version')
    if (versionEl) {
      fetch('/health')
        .then(res => res.json())
        .then(health => {
          versionEl.textContent = `v${health.version || 'unknown'}`
        })
        .catch(() => {
          versionEl.textContent = 'v?'
        })
    }
    modal.classList.add('visible')
  })

  // Close modal
  const closeModal = () => modal.classList.remove('visible')
  closeBtn?.addEventListener('click', closeModal)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal()
  })
}

// ============================================================================
// Connection Overlay
// ============================================================================

export function setupNotConnectedOverlay(): void {
  const overlay = document.getElementById('not-connected-overlay')
  const retryBtn = document.getElementById('retry-connection')
  const exploreBtn = document.getElementById('explore-offline')
  const offlineBanner = document.getElementById('offline-banner')
  const bannerDismiss = document.getElementById('offline-banner-dismiss')

  if (!overlay) return

  retryBtn?.addEventListener('click', () => {
    window.location.reload()
  })

  // Explore button: dismiss overlay, show offline banner
  exploreBtn?.addEventListener('click', () => {
    overlay.classList.remove('visible')
    offlineBanner?.classList.remove('hidden')
  })

  // Dismiss offline banner
  bannerDismiss?.addEventListener('click', () => {
    offlineBanner?.classList.add('hidden')
  })
}

export function showOfflineBanner(): void {
  const banner = document.getElementById('offline-banner')
  banner?.classList.remove('hidden')
}

export function showNotConnectedOverlay(): void {
  const overlay = document.getElementById('not-connected-overlay')
  overlay?.classList.add('visible')
}

export function hideNotConnectedOverlay(): void {
  const overlay = document.getElementById('not-connected-overlay')
  overlay?.classList.remove('visible')
}

// ============================================================================
// Zone Timeout Modal
// ============================================================================

export function setupZoneTimeoutModal(): void {
  const modal = document.getElementById('zone-timeout-modal')
  const closeBtn = document.getElementById('zone-timeout-close')

  if (!modal) return

  closeBtn?.addEventListener('click', () => {
    modal.classList.remove('visible')
  })

  // Close on clicking backdrop
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('visible')
    }
  })

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('visible')) {
      modal.classList.remove('visible')
    }
  })
}

export function showZoneTimeoutModal(): void {
  const modal = document.getElementById('zone-timeout-modal')
  modal?.classList.add('visible')
}
