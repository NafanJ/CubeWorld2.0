export const PALETTE = [
  'red',
  'orange',
  'green',
  'blue',
  'purple',
  'teal',
  'yellow',
  'pink',
  'indigo',
  'lime',
  'amber',
  'rose',
  'cyan',
  'sky',
  'violet',
  'emerald',
  'fuchsia',
  'slate'
] as const;

/**
 * Assigns a unique color from PALETTE to each agent, sorted alphabetically by name.
 * Returns a map of agent id → color string.
 */
export function buildAgentColorMap(
  agents: Array<{ id: string; name: string }>
): Record<string, string> {
  const sorted = [...agents].sort((a, b) => a.name.localeCompare(b.name));
  const colorMap: Record<string, string> = {};
  const used = new Set<string>();
  for (let i = 0; i < sorted.length; i++) {
    const { id } = sorted[i];
    const c = (PALETTE as readonly string[]).find((p) => !used.has(p)) ?? PALETTE[i % PALETTE.length];
    colorMap[id] = c;
    used.add(c);
  }
  return colorMap;
}
