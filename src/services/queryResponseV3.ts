// Transport cancellation or malformed success must never become a valid empty query result.
export async function readQueryResponseV3(response: Response, signal?: AbortSignal): Promise<Record<string, unknown>> {
  let value: unknown
  try { value = await response.json() } catch (reason) {
    if (signal?.aborted || (reason instanceof Error && reason.name === 'AbortError')) throw reason
    throw new Error(response.ok ? '数据响应解析失败，请重新加载' : `请求失败（${response.status}）`)
  }
  if (signal?.aborted) throw new DOMException('query response cancelled', 'AbortError')
  const payload = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
  if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : `请求失败（${response.status}）`)
  if (!payload || !Array.isArray(payload.rows)) throw new Error('数据响应缺少明细数组，请重新加载')
  return payload
}
