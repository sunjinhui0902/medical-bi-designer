import type { Position } from '../models/dashboard.ts'

export function alignmentGuidesV3(position: Position, peers: Position[], bounds: { width: number; height: number; padding: number }, threshold = 6) {
  const solve = (axis: 'x' | 'y', size: 'width' | 'height', limit: number) => {
    const anchors = [bounds.padding, limit / 2, limit - bounds.padding, ...peers.flatMap(peer => [peer[axis], peer[axis] + peer[size] / 2, peer[axis] + peer[size]])]
    let best: { delta: number; coordinate: number } | undefined
    for (const offset of [0, position[size] / 2, position[size]]) for (const coordinate of anchors) {
      const delta = coordinate - position[axis] - offset
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, coordinate }
    }
    const value = Math.max(bounds.padding, Math.min(limit - bounds.padding - position[size], position[axis] + (best?.delta ?? 0)))
    return { value, guide: best && Math.abs(value - position[axis] - best.delta) < .01 ? best.coordinate : undefined }
  }
  const x = solve('x', 'width', bounds.width), y = solve('y', 'height', bounds.height)
  return { position: { ...position, x: x.value, y: y.value }, x: x.guide, y: y.guide }
}
