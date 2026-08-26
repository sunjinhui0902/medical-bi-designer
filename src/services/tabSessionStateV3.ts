export interface TabSelectionScopeV3 {
  componentId: string
  designPageId: string
  preview?: {
    sessionId: string
    activePageInstanceId: string
  }
}

export function tabSelectionScopeKeyV3(scope: TabSelectionScopeV3): string {
  return scope.preview
    ? JSON.stringify(['preview', scope.preview.sessionId, scope.preview.activePageInstanceId, scope.componentId])
    : JSON.stringify(['design', scope.designPageId, scope.componentId])
}
