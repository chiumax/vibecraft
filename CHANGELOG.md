# Changelog

All notable changes to Vibecraft will be documented in this file.

## [Unreleased]

### Added

- **Sound Pack System**: 5 selectable sound packs with different audio themes
  - `Synth` (Default) - Clean synthesized sounds via Tone.js
  - `Half-Life Classic` - Iconic HEV suit sounds (blip, beep, danger, etc.)
  - `Sci-Fi` - Futuristic tech sounds (buttons, whooshes)
  - `Action` - Combat and impact sounds (ricochets, explosions)
  - `Retro` - Classic menu sounds (levers, latches)
- Sound pack selector in Settings modal under Audio section
- WAV file playback support in SoundManager with HTMLAudioElement cloning for overlapping sounds
- Sound pack preference persisted to localStorage via Zustand
- **Session Stats & Achievements System**: Track usage and unlock achievements
  - Per-session stats: prompts, tool usage, success rates, files touched, git commits
  - Prompt tracking with outcome detection (success/error based on errors encountered)
  - 30+ achievements across categories: tools, prompts, git, efficiency, milestones
  - Streak tracking for consecutive successful prompts
  - Stats persisted to `~/.vibecraft/data/session-stats.json`
  - API endpoints: `/session-stats`, `/achievements`, `/prompts`, `/prompts/good`

### Changed

- Sessions panel now uses fixed height (10vh) with scroll overflow instead of flexible sizing
- Sessions panel CSS changed from grid to flex layout for better compatibility with React components
- React Dialog z-index increased from 50 to 9000+ to appear above vanilla modal elements

### Fixed

- Settings button now correctly opens React SettingsModal (was not wired up)
- Sessions panel items no longer stack weirdly due to CSS grid/flex conflict

### Technical

- Added `src/audio/SoundPacks.ts` - Sound pack definitions mapping sounds to WAV files
- Updated `src/audio/SoundManager.ts` - Added pack switching, WAV playback, preloading
- Updated `src/stores/appStore.ts` - Added `soundPack` state and `setSoundPack` action
- Updated `src/components/modals/SettingsModal.tsx` - Added sound pack selector UI
- Updated `src/components/ui/dialog.tsx` - Fixed z-index for modal visibility
- Updated `src/main.ts` - Wired settings button to React modal
- Updated `src/styles/sessions.css` - Fixed layout from grid to flex with fixed height
- Added `public/sfx/` directory with 4 sound pack folders containing WAV files
- Added `server/SessionStatsManager.ts` - Stats tracking and achievement system
- Added `shared/types.ts` - SessionStats, PromptRecord, Achievement types
- Updated `server/index.ts` - Integrated stats tracking into event processing, added API endpoints
