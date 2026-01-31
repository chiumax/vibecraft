/**
 * LayoutManager - Handles responsive layout switching
 *
 * Swaps between desktop, tablet, and mobile layouts based on screen size.
 * Each layout has its own HTML structure optimized for that breakpoint.
 */

export type LayoutType = 'desktop' | 'tablet' | 'mobile'
export type MobileView = 'feed' | 'scene' | 'terminal' | 'shell'

export interface LayoutCallbacks {
  onLayoutChange?: (layout: LayoutType, previousLayout: LayoutType | null) => void
  onBeforeSwap?: (newLayout: LayoutType) => void
  onAfterSwap?: (newLayout: LayoutType) => void
  onViewChange?: (view: MobileView) => void
}

const BREAKPOINTS = {
  mobile: 767,   // 0 - 767px
  tablet: 1023,  // 768 - 1023px
  desktop: Infinity, // 1024px+
}

export class LayoutManager {
  private currentLayout: LayoutType | null = null
  private currentView: MobileView = 'feed'
  private callbacks: LayoutCallbacks = {}
  private layoutContainer: HTMLElement | null = null
  private initialized = false

  constructor(callbacks: LayoutCallbacks = {}) {
    this.callbacks = callbacks
    this.layoutContainer = document.getElementById('layout-container')
  }

  /**
   * Initialize and render the first layout
   * Call this before initializing other components
   */
  init(): LayoutType {
    if (this.initialized) return this.currentLayout!

    // Initial layout detection and render
    const layout = this.detectLayout()
    this.swapLayout(layout)
    this.initialized = true

    // Listen for resize
    window.addEventListener('resize', this.handleResize)

    return layout
  }

  private handleResize = () => {
    const newLayout = this.detectLayout()
    if (newLayout !== this.currentLayout) {
      this.swapLayout(newLayout)
    }
  }

  private detectLayout(): LayoutType {
    const width = window.innerWidth

    if (width <= BREAKPOINTS.mobile) {
      return 'mobile'
    } else if (width <= BREAKPOINTS.tablet) {
      return 'tablet'
    } else {
      return 'desktop'
    }
  }

  private swapLayout(newLayout: LayoutType) {
    const previousLayout = this.currentLayout

    // Callback before swap
    this.callbacks.onBeforeSwap?.(newLayout)

    // Get the template for the new layout
    const template = document.getElementById(`layout-${newLayout}`) as HTMLTemplateElement
    if (!template || !this.layoutContainer) {
      console.error(`Layout template not found: layout-${newLayout}`)
      return
    }

    // Clone the template content
    const content = template.content.cloneNode(true)

    // Clear current layout
    this.layoutContainer.innerHTML = ''

    // Insert new layout
    this.layoutContainer.appendChild(content)

    // Update current layout
    this.currentLayout = newLayout

    // Update body class for CSS hooks
    document.body.classList.remove('layout-desktop', 'layout-tablet', 'layout-mobile')
    document.body.classList.add(`layout-${newLayout}`)

    // Setup mobile navigation if not desktop
    if (newLayout !== 'desktop') {
      this.setupMobileNav()
      // Restore current view
      this.setView(this.currentView)
    }

    // Callback after swap
    this.callbacks.onAfterSwap?.(newLayout)
    this.callbacks.onLayoutChange?.(newLayout, previousLayout)
  }

  private setupMobileNav() {
    const nav = document.getElementById('mobile-nav')
    if (!nav) return

    const buttons = nav.querySelectorAll('.mobile-nav-btn')
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = (btn as HTMLElement).dataset.view as MobileView
        if (view) {
          this.setView(view)
        }
      })
    })
  }

  /**
   * Set the active view (for mobile/tablet layouts)
   */
  setView(view: MobileView) {
    this.currentView = view

    // Update nav button states
    const buttons = document.querySelectorAll('.mobile-nav-btn')
    buttons.forEach(btn => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.view === view)
    })

    // Update panel visibility
    const scenePanel = document.getElementById('scene-panel')
    const feedPanel = document.getElementById('feed-panel')
    const terminalPanel = document.getElementById('terminal-panel')
    const shellPanel = document.getElementById('shell-panel')

    // Hide all panels first
    scenePanel?.classList.remove('panel-visible')
    scenePanel?.classList.add('panel-hidden')
    feedPanel?.classList.remove('panel-visible')
    feedPanel?.classList.add('panel-hidden')
    terminalPanel?.classList.remove('panel-visible')
    terminalPanel?.classList.add('panel-hidden')
    shellPanel?.classList.remove('panel-visible')
    shellPanel?.classList.add('panel-hidden')

    // Show the active panel
    switch (view) {
      case 'feed':
        feedPanel?.classList.remove('panel-hidden')
        feedPanel?.classList.add('panel-visible')
        break
      case 'scene':
        scenePanel?.classList.remove('panel-hidden')
        scenePanel?.classList.add('panel-visible')
        break
      case 'terminal':
        terminalPanel?.classList.remove('panel-hidden')
        terminalPanel?.classList.add('panel-visible')
        break
      case 'shell':
        shellPanel?.classList.remove('panel-hidden')
        shellPanel?.classList.add('panel-visible')
        break
    }

    // Callback
    this.callbacks.onViewChange?.(view)
  }

  /**
   * Get the current layout type
   */
  getLayout(): LayoutType | null {
    return this.currentLayout
  }

  /**
   * Get the current mobile view
   */
  getView(): MobileView {
    return this.currentView
  }

  /**
   * Check if current layout is mobile (includes tablet)
   */
  isMobile(): boolean {
    return this.currentLayout === 'mobile' || this.currentLayout === 'tablet'
  }

  /**
   * Check if current layout is desktop
   */
  isDesktop(): boolean {
    return this.currentLayout === 'desktop'
  }

  /**
   * Force a specific layout (for testing)
   */
  forceLayout(layout: LayoutType) {
    this.swapLayout(layout)
  }

  /**
   * Cleanup
   */
  destroy() {
    window.removeEventListener('resize', this.handleResize)
  }
}

// Singleton instance
let layoutManager: LayoutManager | null = null

export function initLayoutManager(callbacks: LayoutCallbacks = {}): LayoutManager {
  if (!layoutManager) {
    layoutManager = new LayoutManager(callbacks)
  }
  return layoutManager
}

export function getLayoutManager(): LayoutManager | null {
  return layoutManager
}
