/** Shared meta-optimization prompt + stream helpers (host + client safe). */

export const OPTIMIZE_TIMEOUT_MS = 30_000

/** Template variable the user task mandates for the target model. */
export function buildMetaPrompt(selectedModel: string): string {
  return [
    `Du bist ein Prompt-Engineering-Experte. Optimiere den folgenden Nutzer-Prompt`,
    `für das Modell "${selectedModel}" im Kontext von DSH Desktop.`,
    `Verbessere: Klarheit, Struktur, Rollen-Zuweisung, Constraints, Ausgabeformat.`,
    `Gib NUR den optimierten Prompt zurück, keine Erklärungen.`,
    ``,
    `Original-Prompt:`,
  ].join('\n')
}

export interface TextChunk {
  type: string
  text?: string
  block?: { type: string; text?: string }
  reason?: unknown
}

/**
 * Collect a model chunk stream into plain text. Tool-call blocks are
 * skipped: an optimizer result must be pasteable prompt text.
 */
export async function extractText(stream: AsyncIterable<TextChunk>): Promise<string> {
  let out = ''
  for await (const chunk of stream) {
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') out += chunk.text
    else if (chunk.type === 'block-end' && chunk.block?.type === 'text' && typeof chunk.block.text === 'string') {
      // Some adapters only emit the terminal block; avoid double counting
      // when deltas already produced the same text.
      if (!out.includes(chunk.block.text)) out += chunk.block.text
    } else if (chunk.type === 'finish') break
  }
  return out
}

/** Split a stored "provider/model" target back into its route parts. */
export function splitTarget(target: string): { provider: string; model: string } | undefined {
  const slash = target.indexOf('/')
  if (slash <= 0 || slash === target.length - 1) return undefined
  return { provider: target.slice(0, slash), model: target.slice(slash + 1) }
}
