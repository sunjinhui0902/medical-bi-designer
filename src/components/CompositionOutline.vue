<script setup lang="ts">
import type { Position } from '../models/dashboard'
defineProps<{ bounds: Position; count: number }>()
const emit = defineEmits<{ start: [event: PointerEvent, mode: 'move' | 'resize', direction?: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'] }>()
const directions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
</script>
<template>
  <div class="composition-outline" :style="{ left: `${bounds.x}px`, top: `${bounds.y}px`, width: `${bounds.width}px`, height: `${bounds.height}px`, zIndex: bounds.zIndex + 1 }">
    <button type="button" aria-label="移动整个组合" class="composition-grip" @pointerdown.stop="emit('start', $event, 'move')">组合 · {{ count }} 个组件</button>
    <i v-for="direction in directions" :key="direction" class="resize-handle resize-handle-all" :class="`handle-${direction}`" :aria-label="`组合 ${direction} 方向调整大小`" @pointerdown.stop="emit('start', $event, 'resize', direction)"></i>
  </div>
</template>
<style scoped>
.composition-outline{position:absolute;border:2px dashed #7c3aed;pointer-events:none;box-sizing:border-box}.composition-grip{position:absolute;left:0;top:-25px;height:24px;padding:0 8px;color:#fff;background:#7c3aed;border:0;border-radius:4px;font-size:11px;white-space:nowrap;pointer-events:auto;cursor:move}.composition-outline i{pointer-events:auto;background:#7c3aed;border-color:#fff}
</style>
