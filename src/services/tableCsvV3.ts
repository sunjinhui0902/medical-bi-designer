export function tableCsvV3(columns: Array<{ field: string; label: string }>, rows: Array<Record<string, unknown>>) {
  const cell = (value: unknown) => {
    let text = value == null || (typeof value === 'number' && !Number.isFinite(value)) ? '' : String(value)
    if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`
    return `"${text.replace(/"/g, '""')}"`
  }
  return '\uFEFF' + [columns.map(column => cell(column.label)).join(','), ...rows.map(row => columns.map(column => cell(row[column.field])).join(','))].join('\r\n')
}
