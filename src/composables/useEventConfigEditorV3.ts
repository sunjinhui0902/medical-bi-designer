import { computed, ref, toRaw, type Ref } from 'vue'
import type { EventBindingV3 } from '../models/dashboard-v3.ts'

function clone<T>(value: T): T { return structuredClone(toRaw(value)) }

export interface EventConfigSubmitV3 {
  (binding: EventBindingV3): string | null
}

export function useEventConfigEditorV3() {
  const source = ref<EventBindingV3 | null>(null) as Ref<EventBindingV3 | null>
  const draft = ref<EventBindingV3 | null>(null) as Ref<EventBindingV3 | null>
  const dirty = ref(false)
  const error = ref('')
  const isNew = ref(false)
  const selectedEventId = computed(() => draft.value?.id ?? '')

  function load(binding: EventBindingV3 | null) {
    source.value = binding ? clone(binding) : null
    draft.value = binding ? clone(binding) : null
    dirty.value = false
    isNew.value = false
    error.value = ''
  }

  function begin(binding: EventBindingV3) {
    source.value = null
    draft.value = clone(binding)
    dirty.value = true
    isNew.value = true
    error.value = ''
  }
  function markDirty() { dirty.value = true; error.value = '' }
  function cancel() { draft.value = source.value ? clone(source.value) : null; dirty.value = false; error.value = '' }
  function discard() { load(null) }
  function apply(submit: EventConfigSubmitV3): boolean {
    if (!draft.value) return false
    const message = submit(clone(draft.value))
    if (message) { error.value = message; return false }
    source.value = clone(draft.value)
    dirty.value = false
    isNew.value = false
    error.value = ''
    return true
  }

  return { source, draft, dirty, error, isNew, selectedEventId, load, begin, markDirty, cancel, discard, apply }
}
