import type { DashboardApplicationV3, JsonValueV3 } from '../models/dashboard-v3.ts'
import { safeCloneJsonValueV3 } from './eventJsonValueV3.ts'

export interface BrowserAdapterV3 { open(url: string, target: '_blank', features: 'noopener,noreferrer'): 'requested' | 'blocked' }
export interface SafeBrowserDestinationV3 { protocol: 'http:' | 'https:'; origin: string; pathname: string }
export type SafeBrowserOpenResultV3 = { ok: true; destination: SafeBrowserDestinationV3 } | { ok: false; code: string; message: string; effectApplied?: boolean; destination?: SafeBrowserDestinationV3 }
export interface SafeBrowserPortV3 {
  openPageWindow(pageId: string, carryParameterIds: string[], values: Readonly<Record<string, JsonValueV3>>): SafeBrowserOpenResultV3
  openExternalLink(rawUrl: string, carryParameterIds: string[], values: Readonly<Record<string, JsonValueV3>>): SafeBrowserOpenResultV3
}

function carry(url: URL, parameterIds: string[], values: Readonly<Record<string, JsonValueV3>>) {
  if (new Set(parameterIds).size !== parameterIds.length) throw new Error('carry parameter ids must be unique')
  const cloned = safeCloneJsonValueV3(values)
  if (!cloned.ok || !cloned.value || typeof cloned.value !== 'object' || Array.isArray(cloned.value)) throw new Error(cloned.ok ? 'parameter snapshot must be a JSON object' : cloned.message)
  const safeValues = cloned.value as Record<string, JsonValueV3>
  for (const parameterId of parameterIds) {
    if (!Object.hasOwn(safeValues, parameterId)) throw new Error(`parameter snapshot is missing: ${parameterId}`)
    if (url.searchParams.has(`parameter.${parameterId}`)) throw new Error(`parameter query already exists: ${parameterId}`)
    const encoded = JSON.stringify(safeValues[parameterId])
    if (encoded === undefined) throw new Error(`parameter is not JSON serializable: ${parameterId}`)
    url.searchParams.append(`parameter.${parameterId}`, encoded)
  }
}

export function createSafeBrowserPortV3(options: { application: DashboardApplicationV3; baseUrl: string; adapter: BrowserAdapterV3; allowedCarryOrigins?: string[] }): SafeBrowserPortV3 {
  let base: URL
  try { base = new URL(options.baseUrl) } catch { throw new Error('browser base URL is invalid') }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') throw new Error('browser base protocol must be http or https')
  const parameterIds = new Set(options.application.parameters.map((item) => item.id))
  const allowedCarryOrigins = new Set([base.origin, ...(options.allowedCarryOrigins ?? [])])
  const open = (url: URL) => {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false as const, code: 'UNSAFE_URL', message: 'only http and https links are allowed' }
    if (url.username || url.password) return { ok: false as const, code: 'UNSAFE_URL', message: 'URL credentials are not allowed' }
    const destination = { protocol: url.protocol as 'http:' | 'https:', origin: url.origin, pathname: url.pathname }
    let outcome: 'requested' | 'blocked'
    try { outcome = options.adapter.open(url.href, '_blank', 'noopener,noreferrer') } catch { return { ok: false as const, code: 'BROWSER_OPEN_FAILED', message: 'browser window open failed' } }
    if (outcome === 'blocked') return { ok: false as const, code: 'POPUP_BLOCKED', message: 'browser blocked the new window' }
    return { ok: true as const, destination }
  }
  const validateCarry = (ids: string[]) => !Array.isArray(ids) || ids.length > 50 || ids.some((id) => typeof id !== 'string' || !id || !parameterIds.has(id)) ? { ok: false as const, code: 'INVALID_INPUT', message: 'carry parameters are invalid' } : undefined
  const checkedOpen = (url: URL) => new TextEncoder().encode(url.href).length > 8192 ? { ok: false as const, code: 'URL_TOO_LONG', message: 'browser URL exceeds 8192 bytes' } : open(url)
  const port: SafeBrowserPortV3 = {
    openPageWindow(pageId, carryParameterIds, values) {
      const invalid = validateCarry(carryParameterIds); if (invalid) return invalid
      const page = options.application.pages.find((item) => item.id === pageId && item.type === 'standard')
      if (!page) return { ok: false as const, code: 'INVALID_INPUT', message: 'target standard page not found' }
      const url = new URL(base.href); url.search = ''; url.hash = ''; url.searchParams.set('previewPageId', page.id)
      try { carry(url, carryParameterIds, values) } catch (reason) { return { ok: false as const, code: 'INVALID_INPUT', message: reason instanceof Error ? reason.message : 'parameters could not be serialized' } }
      return checkedOpen(url)
    },
    openExternalLink(rawUrl, carryParameterIds, values) {
      const invalid = validateCarry(carryParameterIds); if (invalid) return invalid
      if (typeof rawUrl !== 'string' || rawUrl.trim() !== rawUrl || /[\u0000-\u001f\u007f]/.test(rawUrl)) return { ok: false as const, code: 'UNSAFE_URL', message: 'external URL contains invalid whitespace or controls' }
      let url: URL
      try { url = new URL(rawUrl) } catch { return { ok: false as const, code: 'UNSAFE_URL', message: 'external URL could not be parsed' } }
      if (url.origin === base.origin) return { ok: false as const, code: 'UNSAFE_URL', message: 'same-origin destinations must use openPageWindow' }
      if (carryParameterIds.length && !allowedCarryOrigins.has(url.origin)) return { ok: false as const, code: 'UNSAFE_URL', message: 'parameter carry origin is not allowed' }
      try { carry(url, carryParameterIds, values) } catch (reason) { return { ok: false as const, code: 'INVALID_INPUT', message: reason instanceof Error ? reason.message : 'parameters could not be serialized' } }
      return checkedOpen(url)
    },
  }
  return Object.freeze(port)
}
