// The width a project's cards had the last time they were shown (per project, this session only). The layout editor
// uses it so a column on the canvas is as wide as a column on the real card.
const widths = new Map<string, number>()
export const rememberCardWidth = (projectId: string, width: number) => {
  if (width > 0) widths.set(projectId, Math.round(width))
}
export const lastCardWidth = (projectId: string) => widths.get(projectId)
