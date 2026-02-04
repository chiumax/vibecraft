/**
 * SettingsModal - Application settings (shadcn/ui version)
 *
 * Handles volume, spatial audio, streaming mode, grid size, port configuration,
 * and other application settings.
 */

import { useEffect, useState } from 'react'
import { useAppStore, getAppState } from '../../stores'
import { soundManager } from '../../audio/SoundManager'
import { getSoundPackList, type SoundPackId } from '../../audio/SoundPacks'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Slider } from '../ui/slider'
import { Switch } from '../ui/switch'
import { KeybindSettings } from '../ui/keybind-settings'

interface SettingsModalProps {
  onRefreshSessions?: () => Promise<void>
  agentPort: number
}

export function SettingsModal({ onRefreshSessions, agentPort }: SettingsModalProps) {
  const activeModal = useAppStore((s) => s.activeModal)
  const hideModal = useAppStore((s) => s.hideModal)
  const connected = useAppStore((s) => s.connected)

  // Persisted settings from store
  const volume = useAppStore((s) => s.volume)
  const setVolume = useAppStore((s) => s.setVolume)
  const spatialAudioEnabled = useAppStore((s) => s.spatialAudioEnabled)
  const setSpatialAudioEnabled = useAppStore((s) => s.setSpatialAudioEnabled)
  const soundPack = useAppStore((s) => s.soundPack)
  const setSoundPack = useAppStore((s) => s.setSoundPack)
  const streamingMode = useAppStore((s) => s.streamingMode)
  const setStreamingMode = useAppStore((s) => s.setStreamingMode)
  const gridSize = useAppStore((s) => s.gridSize)
  const setGridSize = useAppStore((s) => s.setGridSize)
  const port = useAppStore((s) => s.port)
  const setPort = useAppStore((s) => s.setPort)
  const stackShellWithSessions = useAppStore((s) => s.stackShellWithSessions)
  const setStackShellWithSessions = useAppStore((s) => s.setStackShellWithSessions)

  // Local state for port input (to avoid immediate changes)
  const [localPort, setLocalPort] = useState(port)

  const isOpen = activeModal === 'settings'

  // Sync local port state when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalPort(agentPort)
    }
  }, [isOpen, agentPort])

  // Apply settings to sound manager when they change
  useEffect(() => {
    soundManager.setVolume(volume / 100)
  }, [volume])

  useEffect(() => {
    soundManager.setSpatialEnabled(spatialAudioEnabled)
  }, [spatialAudioEnabled])

  // Apply sound pack changes
  useEffect(() => {
    soundManager.setSoundPack(soundPack as SoundPackId)
    soundManager.preloadPack()
  }, [soundPack])

  // Apply streaming mode
  useEffect(() => {
    const usernameEl = document.getElementById('username')
    if (usernameEl) {
      if (streamingMode) {
        usernameEl.dataset.realName = usernameEl.textContent || ''
        usernameEl.textContent = '...'
      } else {
        usernameEl.textContent = usernameEl.dataset.realName || usernameEl.textContent
      }
    }
  }, [streamingMode])

  // Apply stack shell mode
  useEffect(() => {
    const sessionsPanel = document.getElementById('sessions-panel')
    if (sessionsPanel) {
      if (stackShellWithSessions) {
        sessionsPanel.classList.add('stacked-shell')
      } else {
        sessionsPanel.classList.remove('stacked-shell')
      }
    }
  }, [stackShellWithSessions])

  const handleVolumeChange = (value: number[]) => {
    const vol = value[0]
    setVolume(vol)
    // Play tick with pitch based on slider position
    const state = getAppState()
    if (state.soundEnabled) {
      soundManager.playSliderTick(vol / 100)
    }
  }

  const handleGridSizeChange = (value: number[]) => {
    const size = value[0]
    setGridSize(size)
    // Update scene grid
    const state = getAppState()
    state.scene?.setGridRange(size)
    if (state.soundEnabled) {
      soundManager.playSliderTick((size - 5) / 75)
    }
  }

  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPort = parseInt(e.target.value, 10)
    setLocalPort(newPort)
  }

  const handlePortBlur = () => {
    if (localPort && localPort > 0 && localPort <= 65535 && localPort !== agentPort) {
      setPort(localPort)
      if (confirm(`Port changed to ${localPort}. Reload page to connect to new port?`)) {
        window.location.reload()
      }
    }
  }

  const handleRefreshSessions = async () => {
    await onRefreshSessions?.()
    hideModal()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && hideModal()}>
      <DialogContent className="sm:max-w-[500px] bg-card border-border">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Audio */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">Audio</Label>
            <div className="space-y-3 pl-1">
              <div className="flex items-center gap-4">
                <span className="text-sm w-16">Volume</span>
                <Slider
                  value={[volume]}
                  onValueChange={handleVolumeChange}
                  min={0}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground w-12 text-right">{volume}%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    id="spatial-audio"
                    checked={spatialAudioEnabled}
                    onCheckedChange={setSpatialAudioEnabled}
                  />
                  <Label htmlFor="spatial-audio" className="text-sm font-normal cursor-pointer">
                    Spatial Audio
                  </Label>
                </div>
                <span className="text-xs text-muted-foreground">
                  Volume/pan based on zone position
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm w-20">Sound Pack</span>
                <select
                  value={soundPack}
                  onChange={(e) => setSoundPack(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {getSoundPackList().map((pack) => (
                    <option key={pack.id} value={pack.id}>
                      {pack.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                {getSoundPackList().find((p) => p.id === soundPack)?.description || ''}
              </p>
            </div>
          </div>

          {/* Privacy */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">Privacy</Label>
            <div className="flex items-center justify-between pl-1">
              <div className="flex items-center gap-2">
                <Switch
                  id="streaming-mode"
                  checked={streamingMode}
                  onCheckedChange={setStreamingMode}
                />
                <Label htmlFor="streaming-mode" className="text-sm font-normal cursor-pointer">
                  Streaming Mode
                </Label>
              </div>
              <span className="text-xs text-muted-foreground">
                Hide username for privacy
              </span>
            </div>
          </div>

          {/* World */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">World</Label>
            <div className="space-y-2 pl-1">
              <div className="flex items-center gap-4">
                <span className="text-sm w-16">Grid Size</span>
                <Slider
                  value={[gridSize]}
                  onValueChange={handleGridSizeChange}
                  min={5}
                  max={80}
                  step={1}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground w-12 text-right">{gridSize}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Number of hex rings from center. Larger = more space, may impact performance.
              </p>
            </div>
          </div>

          {/* Agent Connection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">Agent Connection</Label>
            <div className="flex items-center gap-2 pl-1">
              <span className="text-sm">localhost:</span>
              <Input
                type="number"
                value={localPort}
                min={1}
                max={65535}
                onChange={handlePortChange}
                onBlur={handlePortBlur}
                className="w-24"
              />
              <span className={`text-sm ${connected ? 'text-green-500' : 'text-red-400'}`}>
                {connected ? '● Connected' : '○ Disconnected'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground pl-1">
              Port where the Vibecraft agent is running. Changes require refresh.
            </p>
          </div>

          {/* Layout */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">Layout</Label>
            <div className="flex items-center justify-between pl-1">
              <div className="flex items-center gap-2">
                <Switch
                  id="stack-shell"
                  checked={stackShellWithSessions}
                  onCheckedChange={setStackShellWithSessions}
                />
                <Label htmlFor="stack-shell" className="text-sm font-normal cursor-pointer">
                  Stack Shell with Sessions
                </Label>
              </div>
              <span className="text-xs text-muted-foreground">
                Show both panels instead of switching
              </span>
            </div>
          </div>

          {/* Sessions */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">Sessions</Label>
            <div className="pl-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRefreshSessions}
              >
                🔄 Refresh Sessions
              </Button>
            </div>
          </div>

          {/* Keyboard Shortcuts */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">Keyboard Shortcuts</Label>
            <div className="pl-1">
              <KeybindSettings />
            </div>
            <p className="text-xs text-muted-foreground pl-1">
              Click a keybind to change it. Press the new key combination, or Escape to cancel.
            </p>
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={hideModal}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
