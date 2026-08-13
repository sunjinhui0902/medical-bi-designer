import type { EventActionPortsV3, EventActionRequestV3, EventActionResultV3, InteractionActionPortV3, RefreshActionPortV3, SetParameterActionPortV3 } from './eventRuntimeTypesV3.ts'

export const unavailableSetParameterActionPortV3: SetParameterActionPortV3 = { async execute(request) { return { status: 'failed', issue: { code: 'EXECUTOR_UNAVAILABLE', message: 'setParameter executor unavailable', actionId: request.action.id } } } }
export const unavailableRefreshActionPortV3: RefreshActionPortV3 = { async execute(request) { return { status: 'failed', issue: { code: 'EXECUTOR_UNAVAILABLE', message: 'refresh executor unavailable', actionId: request.action.id } } } }
export const unavailableInteractionActionPortV3: InteractionActionPortV3 = { async execute(request) { return { status: 'failed', issue: { code: 'EXECUTOR_UNAVAILABLE', message: `${request.action.type} executor unavailable`, actionId: request.action.id } } } }
export function createUnavailableEventActionPortsV3(): EventActionPortsV3 { return { setParameter: unavailableSetParameterActionPortV3, refresh: unavailableRefreshActionPortV3, interaction: unavailableInteractionActionPortV3 } }

export function createRecordingEventActionPortsV3(responder: (request: EventActionRequestV3) => EventActionResultV3 | Promise<EventActionResultV3> = () => ({ status: 'succeeded' })) {
  const requests: EventActionRequestV3[] = []
  const setParameter: SetParameterActionPortV3 = { async execute(request) { requests.push(request); return responder(request) } }
  const refresh: RefreshActionPortV3 = { async execute(request) { requests.push(request); return responder(request) } }
  const interaction: InteractionActionPortV3 = { async execute(request) { requests.push(request); return responder(request) } }
  return { ports: { setParameter, refresh, interaction }, requests }
}
