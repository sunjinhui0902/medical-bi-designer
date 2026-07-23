import type { DashboardComponent } from '../models/dashboard'

export interface MedicalComponentTemplate {
  id: string
  sourceComponentId: string
  name: string
  category: string
  component: DashboardComponent
  createdAt: string
  updatedAt: string
}

function cloneComponent(component: DashboardComponent) {
  return JSON.parse(JSON.stringify(component)) as DashboardComponent
}

export function saveMedicalTemplate(
  component: DashboardComponent,
  category: string,
  existing?: MedicalComponentTemplate,
): MedicalComponentTemplate {
  const now = new Date().toISOString()
  return {
    id: existing?.id ?? `medical_template_${Date.now().toString(36)}`,
    sourceComponentId: component.id,
    name: component.title,
    category: category.trim() || '自定义医疗组件',
    component: cloneComponent(component),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

export function instantiateMedicalTemplate(
  template: MedicalComponentTemplate,
  id: string,
  x: number,
  y: number,
): DashboardComponent {
  const component = cloneComponent(template.component)
  component.id = id
  component.title = template.name
  component.position.x = x
  component.position.y = y
  component.position.zIndex = 1
  return component
}

export function normalizeMedicalTemplates(value: unknown): MedicalComponentTemplate[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is MedicalComponentTemplate => Boolean(
    item && typeof item === 'object'
    && typeof item.id === 'string'
    && typeof item.name === 'string'
    && typeof item.category === 'string'
    && item.component && typeof item.component === 'object',
  ))
}
