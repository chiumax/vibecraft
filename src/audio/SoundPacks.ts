/**
 * SoundPacks - External sound pack definitions for Vibecraft
 *
 * Each pack maps sound names to WAV file paths.
 * Sounds not mapped will fall back to synthesized sounds.
 */

import type { SoundName } from './SoundManager'

export type SoundPackId = 'synth' | 'classic' | 'scifi' | 'action' | 'retro'

export interface SoundPack {
  id: SoundPackId
  name: string
  description: string
  sounds: Partial<Record<SoundName, string>>
}

const BASE_PATH = '/sfx'

export const SOUND_PACKS: Record<SoundPackId, SoundPack> = {
  synth: {
    id: 'synth',
    name: 'Synth (Default)',
    description: 'Clean synthesized sounds',
    sounds: {}, // Empty = use all synth sounds
  },

  classic: {
    id: 'classic',
    name: 'Half-Life Classic',
    description: 'Iconic HEV suit sounds',
    sounds: {
      // Tools
      read: `${BASE_PATH}/classic/blip.wav`,
      write: `${BASE_PATH}/classic/activated.wav`,
      edit: `${BASE_PATH}/classic/boop.wav`,
      bash: `${BASE_PATH}/classic/beep.wav`,
      grep: `${BASE_PATH}/classic/blip.wav`,
      task: `${BASE_PATH}/classic/acquired.wav`,
      // States
      success: `${BASE_PATH}/classic/suitchargeok1.wav`,
      error: `${BASE_PATH}/classic/danger.wav`,
      // UI
      click: `${BASE_PATH}/classic/blip.wav`,
      notification: `${BASE_PATH}/classic/bell.wav`,
      // Items
      spawn: `${BASE_PATH}/classic/smallmedkit1.wav`,
      focus: `${BASE_PATH}/classic/wpn_select.wav`,
    },
  },

  scifi: {
    id: 'scifi',
    name: 'Sci-Fi',
    description: 'Futuristic tech sounds',
    sounds: {
      // Tools
      read: `${BASE_PATH}/scifi/blip1.wav`,
      write: `${BASE_PATH}/scifi/button3.wav`,
      edit: `${BASE_PATH}/scifi/blip2.wav`,
      bash: `${BASE_PATH}/scifi/button1.wav`,
      grep: `${BASE_PATH}/scifi/wpn_moveselect.wav`,
      task: `${BASE_PATH}/scifi/button9.wav`,
      // States
      success: `${BASE_PATH}/scifi/wpn_hudon.wav`,
      error: `${BASE_PATH}/scifi/spark1.wav`,
      // UI
      click: `${BASE_PATH}/scifi/blip1.wav`,
      notification: `${BASE_PATH}/scifi/button9.wav`,
      // Effects
      spawn: `${BASE_PATH}/scifi/flashlight1.wav`,
      zone_create: `${BASE_PATH}/scifi/doormove1.wav`,
    },
  },

  action: {
    id: 'action',
    name: 'Action',
    description: 'Combat and impact sounds',
    sounds: {
      // Tools
      read: `${BASE_PATH}/action/ric1.wav`,
      write: `${BASE_PATH}/action/reload1.wav`,
      edit: `${BASE_PATH}/action/cbar_hit1.wav`,
      bash: `${BASE_PATH}/action/bullet_hit1.wav`,
      grep: `${BASE_PATH}/action/ric3.wav`,
      task: `${BASE_PATH}/action/mine_activate.wav`,
      // States
      success: `${BASE_PATH}/action/ammopickup1.wav`,
      error: `${BASE_PATH}/action/debris1.wav`,
      // Effects
      spawn: `${BASE_PATH}/action/gunpickup2.wav`,
      git_commit: `${BASE_PATH}/action/explode3.wav`,
    },
  },

  retro: {
    id: 'retro',
    name: 'Retro',
    description: 'Classic menu sounds',
    sounds: {
      // Tools
      read: `${BASE_PATH}/retro/menu1.wav`,
      write: `${BASE_PATH}/retro/menu2.wav`,
      edit: `${BASE_PATH}/retro/menu3.wav`,
      bash: `${BASE_PATH}/retro/launch_select1.wav`,
      grep: `${BASE_PATH}/retro/menu1.wav`,
      task: `${BASE_PATH}/retro/launch_glow1.wav`,
      // States
      success: `${BASE_PATH}/retro/latchunlocked1.wav`,
      error: `${BASE_PATH}/retro/wpn_denyselect.wav`,
      // UI
      click: `${BASE_PATH}/retro/menu1.wav`,
      notification: `${BASE_PATH}/retro/bell1.wav`,
      focus: `${BASE_PATH}/retro/launch_select2.wav`,
      modal_open: `${BASE_PATH}/retro/lever1.wav`,
    },
  },
}

/**
 * Get list of available sound packs for UI
 */
export function getSoundPackList(): Array<{ id: SoundPackId; name: string; description: string }> {
  return Object.values(SOUND_PACKS).map(({ id, name, description }) => ({
    id,
    name,
    description,
  }))
}
