import { soundManager as _soundManager, SoundManager } from './SoundManager'
import { spatialAudioContext as _spatialAudioContext, SpatialAudioContext } from './SpatialAudioContext'

// Re-export everything
export const soundManager = _soundManager
export { SoundManager }
export type { SoundName, SoundPlayOptions } from './SoundManager'
export const spatialAudioContext = _spatialAudioContext
export { SpatialAudioContext }
export type { SpatialMode, SpatialSource, SpatialParams } from './SpatialAudioContext'

/**
 * Initialize audio on first user interaction (required by browsers)
 * Call this from the main init function to set up listeners
 */
export function initAudioOnInteraction(): void {
  const initAudio = () => {
    _soundManager.init()
    document.removeEventListener('click', initAudio)
    document.removeEventListener('keydown', initAudio)
  }
  document.addEventListener('click', initAudio, { once: true })
  document.addEventListener('keydown', initAudio, { once: true })
}
