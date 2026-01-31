/**
 * MobileLayoutManager - Handles mobile-specific layout and navigation
 *
 * Manages panel visibility and navigation between Feed, Workshop (3D scene),
 * and Terminal views on mobile devices.
 */

export type MobileView = 'feed' | 'scene' | 'terminal' | 'shell'

export interface MobileLayoutCallbacks {
  onViewChange?: (view: MobileView) => void
  onMobileChange?: (isMobile: boolean) => void
}

export class MobileLayoutManager {
  private currentView: MobileView = 'feed'
  private isMobile = false
  private callbacks: MobileLayoutCallbacks = {}

  // DOM elements
  private scenePanel: HTMLElement | null = null
  private feedPanel: HTMLElement | null = null
  private terminalPanel: HTMLElement | null = null
  private shellPanel: HTMLElement | null = null
  private navButtons: Map<MobileView, HTMLElement> = new Map()

  constructor(callbacks?: MobileLayoutCallbacks) {
    this.callbacks = callbacks || {}
    this.init()
  }

  private init(): void {
    // Cache DOM elements
    this.scenePanel = document.getElementById('scene-panel')
    this.feedPanel = document.getElementById('feed-panel')
    this.terminalPanel = document.getElementById('terminal-panel')
    this.shellPanel = document.getElementById('shell-panel')

    // Cache nav buttons
    const feedBtn = document.getElementById('nav-feed')
    const sceneBtn = document.getElementById('nav-scene')
    const terminalBtn = document.getElementById('nav-terminal')
    const shellBtn = document.getElementById('nav-shell')

    if (feedBtn) this.navButtons.set('feed', feedBtn)
    if (sceneBtn) this.navButtons.set('scene', sceneBtn)
    if (terminalBtn) this.navButtons.set('terminal', terminalBtn)
    if (shellBtn) this.navButtons.set('shell', shellBtn)

    // Setup media query listener
    const mq = window.matchMedia('(max-width: 1023px)')
    mq.addEventListener('change', (e) => this.handleResize(e.matches))
    this.handleResize(mq.matches)

    // Setup nav button listeners
    this.setupNavListeners()
  }

  private handleResize(isMobile: boolean): void {
    const wasMobile = this.isMobile
    this.isMobile = isMobile

    if (isMobile && !wasMobile) {
      // Transitioning to mobile - apply mobile layout
      this.applyMobileLayout()
    } else if (!isMobile && wasMobile) {
      // Transitioning to desktop - reset to desktop layout
      this.resetDesktopLayout()
    }

    if (wasMobile !== isMobile) {
      this.callbacks.onMobileChange?.(isMobile)
    }
  }

  private applyMobileLayout(): void {
    // Set initial view to feed (default on mobile)
    this.setView('feed')
  }

  private resetDesktopLayout(): void {
    // Remove all mobile-specific classes
    this.scenePanel?.classList.remove('mobile-visible')
    this.feedPanel?.classList.remove('mobile-hidden')
    this.terminalPanel?.classList.remove('mobile-visible')
    this.shellPanel?.classList.remove('mobile-visible')

    // Reset nav button states
    this.navButtons.forEach((btn) => btn.classList.remove('active'))
  }

  private setupNavListeners(): void {
    this.navButtons.forEach((btn, view) => {
      btn.addEventListener('click', () => {
        if (this.isMobile) {
          this.setView(view)
        }
      })
    })
  }

  /**
   * Switch to a different view (mobile only)
   */
  public setView(view: MobileView): void {
    if (!this.isMobile) return

    this.currentView = view

    // Update panel visibility
    if (this.scenePanel) {
      this.scenePanel.classList.toggle('mobile-visible', view === 'scene')
    }
    if (this.feedPanel) {
      this.feedPanel.classList.toggle('mobile-hidden', view !== 'feed')
    }
    if (this.terminalPanel) {
      this.terminalPanel.classList.toggle('mobile-visible', view === 'terminal')
    }
    if (this.shellPanel) {
      this.shellPanel.classList.toggle('mobile-visible', view === 'shell')
    }

    // Update nav button active states
    this.navButtons.forEach((btn, btnView) => {
      btn.classList.toggle('active', btnView === view)
    })

    // Trigger callback
    this.callbacks.onViewChange?.(view)

    // Handle special view transitions
    if (view === 'scene') {
      // Trigger resize to ensure canvas is properly sized
      window.dispatchEvent(new Event('resize'))
    }
  }

  /**
   * Get the current view
   */
  public getView(): MobileView {
    return this.currentView
  }

  /**
   * Check if currently in mobile mode
   */
  public getIsMobile(): boolean {
    return this.isMobile
  }

  /**
   * Programmatically show the scene (useful for zone selection)
   */
  public showScene(): void {
    if (this.isMobile) {
      this.setView('scene')
    }
  }

  /**
   * Programmatically show the feed
   */
  public showFeed(): void {
    if (this.isMobile) {
      this.setView('feed')
    }
  }

  /**
   * Programmatically show the terminal
   */
  public showTerminal(): void {
    if (this.isMobile) {
      this.setView('terminal')
    }
  }

  /**
   * Programmatically show the shell
   */
  public showShell(): void {
    if (this.isMobile) {
      this.setView('shell')
    }
  }

  /**
   * Set the terminal panel reference (for when it's shown/hidden independently)
   */
  public setTerminalPanel(panel: HTMLElement): void {
    this.terminalPanel = panel
  }

  /**
   * Set the shell panel reference
   */
  public setShellPanel(panel: HTMLElement): void {
    this.shellPanel = panel
  }

  /**
   * Update callbacks
   */
  public setCallbacks(callbacks: MobileLayoutCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks }
  }
}

// Singleton instance
let mobileLayoutManager: MobileLayoutManager | null = null

/**
 * Initialize the mobile layout manager
 */
export function setupMobileLayout(callbacks?: MobileLayoutCallbacks): MobileLayoutManager {
  if (!mobileLayoutManager) {
    mobileLayoutManager = new MobileLayoutManager(callbacks)
  } else if (callbacks) {
    mobileLayoutManager.setCallbacks(callbacks)
  }
  return mobileLayoutManager
}

/**
 * Get the mobile layout manager instance
 */
export function getMobileLayoutManager(): MobileLayoutManager | null {
  return mobileLayoutManager
}
