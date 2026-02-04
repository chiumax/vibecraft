/**
 * MobileNav - Bottom navigation bar for mobile/tablet layouts
 *
 * Provides navigation between feed, scene, and terminal views.
 */

import { useAppStore } from '../../stores'
import type { ViewType } from '../../stores'

interface NavButton {
  view: ViewType
  icon: string
  label: string
}

const NAV_BUTTONS: NavButton[] = [
  { view: 'feed', icon: '📋', label: 'Feed' },
  { view: 'scene', icon: '🎮', label: 'Workshop' },
  { view: 'terminal', icon: '⌨️', label: 'Terminal' },
]

interface MobileNavProps {
  /** Use shorter labels for mobile */
  compact?: boolean
}

export function MobileNav({ compact = false }: MobileNavProps) {
  const currentLayout = useAppStore((s) => s.currentLayout)
  const currentView = useAppStore((s) => s.currentView)
  const setCurrentView = useAppStore((s) => s.setCurrentView)

  // Only show on mobile/tablet layouts
  if (currentLayout === 'desktop') return null

  const handleNavClick = (view: ViewType) => {
    setCurrentView(view)
  }

  return (
    <nav id="mobile-nav">
      {NAV_BUTTONS.map((btn) => (
        <button
          key={btn.view}
          className={`mobile-nav-btn ${currentView === btn.view ? 'active' : ''}`}
          data-view={btn.view}
          onClick={() => handleNavClick(btn.view)}
        >
          <span className="nav-icon">{btn.icon}</span>
          <span className="nav-label">
            {compact && btn.view === 'terminal' ? 'Term' :
             compact && btn.view === 'scene' ? 'Scene' : btn.label}
          </span>
        </button>
      ))}
    </nav>
  )
}
