const UNSAFE_STYLE_TOKEN = /(?:url\s*\(|var\s*\(|expression\s*\(|@import|javascript:|data:)/i
const STYLE_TOKEN_CHARACTERS = /^[a-z0-9#(),.%+\-\s]*$/i

/** Accept colors, controlled gradients and shadows without remote CSS resources. */
export function isSafeStyleTokenV3(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 500
    && !/[\u0000-\u001f\u007f;{}'"\\]/.test(value)
    && !UNSAFE_STYLE_TOKEN.test(value)
    && STYLE_TOKEN_CHARACTERS.test(value)
}

export function safeStyleTokenV3(value: unknown, fallback = ''): string {
  return isSafeStyleTokenV3(value) ? value : fallback
}
