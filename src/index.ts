import type { Context } from '@deepseek-ai/cordis'
import { buildMetaPrompt, extractText, OPTIMIZE_TIMEOUT_MS } from './optimize.js'

export const name = 'dsh-prompt-optimizer'

/** Host-side services used by the optimizer command. */
export const inject = ['llm', 'settings']

/** Narrow context face over the injected host services (keeps `noImplicitAny`). */
export interface HostPluginContext extends Context {
  llm: {
    stream: (options: {
      provider: string
      model: string
      messages: Array<{ role: string; content: string }>
      signal?: AbortSignal
    }) => AsyncIterable<{ type: string; text?: string; block?: { type: string; text?: string } }>
  }
  settings: {
    register: (namespace: string, schema: Record<string, { type: string; default: string }>) => void
  }
  command: (name: string, handler: (req: OptimizeRequest) => Promise<OptimizeResult>) => void
}

const SETTINGS_NAMESPACE = 'promptOptimizer'
const DEFAULT_TARGET = 'deepseek-chat'

export interface OptimizeRequest {
  /** Raw composer draft to optimize. */
  draft: string
  /** Provider route, e.g. "deepseek". */
  provider: string
  /** Provider-owned model id, e.g. "deepseek-chat". */
  model: string
}

export interface OptimizeResult {
  ok: true
  text: string
}

/**
 * Host plugin body: registers the settings namespace default and exposes
 * the `promptOptimizer/optimize` command used by the composer button.
 */
export function apply(ctx: HostPluginContext): void {
  ctx.effect(() => {
    try {
      ctx.settings.register(SETTINGS_NAMESPACE, {
        targetModel: { type: 'string', default: DEFAULT_TARGET },
      })
    } catch {
      // Namespace may already exist after HMR; defaults persist.
    }
    return () => {}
  }, 'prompt-optimizer: settings namespace')

  ctx.command('promptOptimizer/optimize', async (req: OptimizeRequest): Promise<OptimizeResult> => {
    const draft = req.draft.trim()
    if (draft === '') throw new Error('prompt-optimizer: empty draft')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('prompt-optimizer: timed out after 30s')), OPTIMIZE_TIMEOUT_MS)
    try {
      const stream = ctx.llm.stream({
        provider: req.provider,
        model: req.model,
        messages: [
          { role: 'system', content: buildMetaPrompt(`${req.provider}/${req.model}`) },
          { role: 'user', content: draft },
        ],
        signal: controller.signal,
      })
      const text = await extractText(stream)
      if (text.trim() === '') throw new Error('prompt-optimizer: empty model response')
      return { ok: true, text: text.trim() }
    } finally {
      clearTimeout(timer)
    }
  })
}
