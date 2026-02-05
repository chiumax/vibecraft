/**
 * SettingsModal - Application settings
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { KeybindSettings } from '../ui/keybind-settings'
import { Volume2, Eye, Grid3X3, Wifi, Layout, RefreshCw, Keyboard } from 'lucide-react'

interface SettingsModalProps {
  onRefreshSessions?: () => Promise<void>
  agentPort: number
}

function SettingsSection({
  icon: Icon,
  title,
  children
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </div>
      <div className="space-y-4 pl-6">
        {children}
      </div>
    </div>
  )
}

function SettingRow({
  label,
  description,
  children
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label className="text-sm">{label}</Label>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  )
}

export function SettingsModal({ onRefreshSessions, agentPort }: SettingsModalProps) {
  const activeModal = useAppStore((s) => s.activeModal)
  const hideModal = useAppStore((s) => s.hideModal)
  const connected = useAppStore((s) => s.connected)

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

  const [localPort, setLocalPort] = useState(port)
  const isOpen = activeModal === 'settings'

  useEffect(() => {
    if (isOpen) setLocalPort(agentPort)
  }, [isOpen, agentPort])

  useEffect(() => {
    soundManager.setVolume(volume / 100)
  }, [volume])

  useEffect(() => {
    soundManager.setSpatialEnabled(spatialAudioEnabled)
  }, [spatialAudioEnabled])

  useEffect(() => {
    soundManager.setSoundPack(soundPack as SoundPackId)
    soundManager.preloadPack()
  }, [soundPack])

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

  useEffect(() => {
    const sessionsPanel = document.getElementById('sessions-panel')
    if (sessionsPanel) {
      sessionsPanel.classList.toggle('stacked-shell', stackShellWithSessions)
    }
  }, [stackShellWithSessions])

  const handleVolumeChange = (value: number[]) => {
    const vol = value[0]
    setVolume(vol)
    const state = getAppState()
    if (state.soundEnabled) soundManager.playSliderTick(vol / 100)
  }

  const handleGridSizeChange = (value: number[]) => {
    const size = value[0]
    setGridSize(size)
    const state = getAppState()
    state.scene?.setGridRange(size)
    if (state.soundEnabled) soundManager.playSliderTick((size - 5) / 75)
  }

  const handlePortBlur = () => {
    if (localPort && localPort > 0 && localPort <= 65535 && localPort !== agentPort) {
      setPort(localPort)
      if (confirm(`Port changed to ${localPort}. Reload page to connect to new port?`)) {
        window.location.reload()
      }
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && hideModal()}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Audio */}
          <SettingsSection icon={Volume2} title="Audio">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Label className="w-20 text-sm">Volume</Label>
                <Slider
                  value={[volume]}
                  onValueChange={handleVolumeChange}
                  min={0}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <span className="w-12 text-right text-sm tabular-nums">{volume}%</span>
              </div>

              <SettingRow label="Spatial Audio" description="Volume and pan based on zone position">
                <Switch checked={spatialAudioEnabled} onCheckedChange={setSpatialAudioEnabled} />
              </SettingRow>

              <div className="space-y-2">
                <Label className="text-sm">Sound Pack</Label>
                <Select value={soundPack} onValueChange={setSoundPack}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getSoundPackList().map((pack) => (
                      <SelectItem key={pack.id} value={pack.id}>
                        {pack.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {getSoundPackList().find((p) => p.id === soundPack)?.description}
                </p>
              </div>
            </div>
          </SettingsSection>

          <div className="border-t border-border" />

          {/* Privacy */}
          <SettingsSection icon={Eye} title="Privacy">
            <SettingRow label="Streaming Mode" description="Hide username for privacy">
              <Switch checked={streamingMode} onCheckedChange={setStreamingMode} />
            </SettingRow>
          </SettingsSection>

          <div className="border-t border-border" />

          {/* World */}
          <SettingsSection icon={Grid3X3} title="World">
            <div className="space-y-2">
              <div className="flex items-center gap-4">
                <Label className="w-20 text-sm">Grid Size</Label>
                <Slider
                  value={[gridSize]}
                  onValueChange={handleGridSizeChange}
                  min={5}
                  max={80}
                  step={1}
                  className="flex-1"
                />
                <span className="w-12 text-right text-sm tabular-nums">{gridSize}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Number of hex rings from center. Larger values may impact performance.
              </p>
            </div>
          </SettingsSection>

          <div className="border-t border-border" />

          {/* Connection */}
          <SettingsSection icon={Wifi} title="Connection">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Label className="text-sm">Port</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">localhost:</span>
                  <Input
                    type="number"
                    value={localPort}
                    min={1}
                    max={65535}
                    onChange={(e) => setLocalPort(parseInt(e.target.value, 10))}
                    onBlur={handlePortBlur}
                    className="w-24"
                  />
                </div>
                <span className={connected ? 'text-green-500 text-sm' : 'text-red-400 text-sm'}>
                  {connected ? '● Connected' : '○ Disconnected'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Port where the Vibecraft agent is running.
              </p>
            </div>
          </SettingsSection>

          <div className="border-t border-border" />

          {/* Layout */}
          <SettingsSection icon={Layout} title="Layout">
            <SettingRow label="Stack Shell with Sessions" description="Show both panels instead of switching">
              <Switch checked={stackShellWithSessions} onCheckedChange={setStackShellWithSessions} />
            </SettingRow>
          </SettingsSection>

          <div className="border-t border-border" />

          {/* Sessions */}
          <SettingsSection icon={RefreshCw} title="Sessions">
            <Button variant="secondary" onClick={() => onRefreshSessions?.().then(hideModal)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh Sessions
            </Button>
          </SettingsSection>

          <div className="border-t border-border" />

          {/* Keyboard */}
          <SettingsSection icon={Keyboard} title="Keyboard Shortcuts">
            <KeybindSettings />
            <p className="text-xs text-muted-foreground">
              Click a keybind to change it. Press the new key combination, or Escape to cancel.
            </p>
          </SettingsSection>
        </div>

        <div className="flex justify-end pt-4 border-t border-border">
          <Button onClick={hideModal}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
