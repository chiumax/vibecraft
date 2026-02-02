# Refactoring Notes

This document tracks potential refactoring opportunities and technical debt for future work.

## Completed Refactoring (2026-02)

### CSS Consolidation

1. **Deleted unused MobileLayoutManager.ts** - Replaced by the unified `LayoutManager.ts`

2. **Created touch-layout.css** - Extracted shared mobile/tablet styles into a single file:
   - Layout container styles
   - Panel states (hidden/visible)
   - Scene, feed, terminal panel positioning
   - Mobile navigation display
   - HUD adjustments (keybind helper, buttons, timeline, voice control, draw palette)
   - Terminal button sizing
   - Sessions panel flex layout
   - Shell tab content layout
   - Todos tab content layout

3. **Simplified mobile.css and tablet.css** - Now contain only breakpoint-specific overrides:
   - `mobile.css`: Keyboard height adjustments, single-column sessions, bottom sheet modals, iOS zoom prevention, smaller touch targets
   - `tablet.css`: Larger nav buttons, 2-column sessions grid, slightly different modal styling

## Future Refactoring Opportunities

### 1. Template Duplication

**Problem:** The responsive layout system uses three separate HTML templates in `src/ui/LayoutManager.ts`:
- `desktopTemplate`
- `tabletTemplate`
- `mobileTemplate`

These templates share ~80% of their structure, leading to maintenance burden when adding new UI elements.

**Proposed Solution:** Consider a component-based approach:
- Define a single HTML template with all elements
- Use CSS classes to show/hide elements based on layout mode
- Or use a lightweight templating approach with shared partials

**Trade-offs:**
- Current approach: More duplication but simpler to understand each layout
- Component approach: Less duplication but more complex CSS/JS logic

### 2. Tab Switching Logic Consolidation

**Problem:** Tab switching logic is duplicated between:
- `LayoutManager.ts` (`activateFeedTab()` method)
- `main.ts` (click handlers for tab buttons)
- Various event handlers

**Proposed Solution:** Create a `TabManager` class or centralize all tab switching in `LayoutManager`.

### 3. Event Handler Cleanup

Some event handling still happens in `main.ts` that could be moved to the EventBus handler system:
- DOM updates for stats
- Some UI state changes

### 4. Terminal Manager Simplification

The terminal management is split between:
- `TerminalManager` class (manages multiple session terminals)
- `ShellManager` class (manages shell tabs)
- Various terminal-related code in `main.ts`

Could potentially be unified into a single terminal orchestration layer.

### 5. CSS Variable Standardization

Some hardcoded values still exist that should use CSS variables:
- Colors (some still use hex values directly)
- Spacing (some components use pixel values instead of variables)
- Animation timings

### 6. Type Safety Improvements

- Add stricter types for event payloads
- Add type guards for DOM element queries
- Consider using branded types for session IDs

## Notes

- When refactoring, ensure mobile/tablet layouts are tested on actual devices
- Keep in mind that `visualViewport` API is used for keyboard height detection
- Terminal rendering relies on multiple fit() calls with delays for reliability
