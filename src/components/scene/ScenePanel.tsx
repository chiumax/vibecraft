/**
 * ScenePanel - Container for Three.js scene
 *
 * Manages the Three.js canvas and scene lifecycle within React.
 */

import { useRef, useEffect } from 'react'
import { useThreeScene } from '../../hooks/useThreeScene'
import { useAppStore } from '../../stores'
import type { WorkshopScene } from '../../scene/WorkshopScene'

interface ScenePanelProps {
  /** Called when scene is initialized */
  onSceneReady?: (scene: WorkshopScene) => void
  /** Called when scene is disposed */
  onSceneDispose?: () => void
}

export function ScenePanel({ onSceneReady, onSceneDispose }: ScenePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const setScene = useAppStore((s) => s.setScene)

  const { sceneRef } = useThreeScene(containerRef, {
    onInit: (scene) => {
      setScene(scene)
      onSceneReady?.(scene)
    },
    onDispose: () => {
      setScene(null)
      onSceneDispose?.()
    },
  })

  return (
    <div id="scene-panel">
      <div id="canvas-container" ref={containerRef} />
    </div>
  )
}
