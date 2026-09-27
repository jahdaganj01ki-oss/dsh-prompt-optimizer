/** SVG wand icon for the composer button (no emoji, theme-aware). */
export function WandIcon(props: { size?: number }): { tag: 'svg'; size: number } {
  return { tag: 'svg', size: props.size ?? 14 }
}

export const WAND_PATH =
  'M9.5 2.5a.75.75 0 0 1 1.06 0l.94.94a.75.75 0 0 1 0 1.06l-5.5 5.5a.75.75 0 0 1-1.06 0l-.94-.94a.75.75 0 0 1 0-1.06l5.5-5.5Z' +
  'M13.5 2a1 1 0 0 1 1 1v.5a.5.5 0 0 0 1 0V3a1 1 0 0 1 1-1h.5a.5.5 0 0 0 0-1H16a1 1 0 0 1-1-1V-.5a.5.5 0 0 0-1 0V0a1 1 0 0 1-1 1h-.5a.5.5 0 0 0 0 1H13Z'
