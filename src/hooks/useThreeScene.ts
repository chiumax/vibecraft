/**
 * useThreeScene - React hook for Three.js scene integration
 *
 * Manages the lifecycle of the WorkshopScene within React,
 * keeping Three.js completely separate from React's render cycle.
 */

import { useEffect, useRef, type RefObject } from 'react'
import { WorkshopScene } from '../scene/WorkshopScene'

export interface UseThreeSceneOptions {
  /** Callback when scene is initialized */
  onInit?: (scene: WorkshopScene) => void
  /** Callback when scene is disposed */
  onDispose?: () => void
}

export interface UseThreeSceneReturn {
  /** Reference to the scene instance */
  sceneRef: RefObject<WorkshopScene | null>
}

/**
 * Hook to manage a Three.js WorkshopScene
 *
 * The scene is created when the container element is available
 * and disposed when the component unmounts or container changes.
 *
 * @param containerRef - Ref to the container element for the canvas
 * @param options - Scene options
 */
export function useThreeScene(
  containerRef: RefObject<HTMLElement | null>,
  options: UseThreeSceneOptions = {}
): UseThreeSceneReturn {
  const sceneRef = useRef<WorkshopScene | null>(null)
  const { onInit, onDispose } = options

  useEffect(() => {
    if (!containerRef.current) return

    // Create scene
    const scene = new WorkshopScene(containerRef.current)
    sceneRef.current = scene

    // Start rendering
    scene.start()

    // Callback
    onInit?.(scene)

    // Cleanup on unmount
    return () => {
      onDispose?.()
      scene.dispose()
      sceneRef.current = null
    }
  }, [containerRef, onInit, onDispose])

  return { sceneRef }
}
