import type { Context } from '@deepseek-ai/cordis'
import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import { splitTarget } from './optimize.js'

export const name = 'dsh-prompt-optimizer/client'

/** Client-side services consumed by the composer button + settings panel. */
export const inject = [
  'slots',
  'locale',
  'connection',
  'modelDirectories',
  'sessions',
  'remote',
  'remote.session',
  'settingsScope',
]

/** Narrow client context face over the injected browser services. */
export interface ClientPluginContext extends Context {
  locale: {
    register: (ns: string, dicts: Record<string, Record<string, string>>) => void
    bind: (ns: string) => (key: string) => string
  }
  settingsScope: {
    bind: (opts: { namespace: string }) => {
      get: (field: string) => unknown
      set: (field: string, value: unknown) => Promise<void>
    }
  }
  connection: {
    rpc: {
      call: (path: string, method: string, payload: Record<string, string>) => Promise<unknown>
    }
  }
  modelDirectories: {
    directoryFor: (sessionId: string) => {
      store: (selector: (s: DirectorySnapshot) => DirectorySnapshot) => DirectorySnapshot
      load: () => Promise<unknown>
    }
  }
  slots: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    register: (options: Record<string, any>, component: (props: any) => JSX.Element | null) => void
    inject: (name: string, factory: () => void) => void
  }
}
const NS = 'promptOptimizer'
const SETTINGS_NAMESPACE = 'promptOptimizer'
const TARGET_FIELD = 'targetModel'
const FALLBACK_TARGET = 'deepseek/deepseek-chat'

interface DirectoryModel {
  id: string
  name: string
}

interface DirectoryGroup {
  id: string
  name: string
  models: DirectoryModel[]
}

interface DirectorySnapshot {
  current: { provider: string; model: string } | null
  groups: DirectoryGroup[]
  status: 'idle' | 'loading' | 'ready' | 'selecting' | 'error'
  error: string | null
}

interface InputSnapshot {
  draft: string
}

interface InputActions {
  setDraft: (text: string) => void
}

interface OptimizerButtonProps {
  useInput?: (selector: (s: InputSnapshot) => InputSnapshot) => InputSnapshot
  inputActions?: InputActions
  useDirectory?: (selector: (s: DirectorySnapshot) => DirectorySnapshot) => DirectorySnapshot
  loadDirectory?: () => Promise<unknown>
  readTarget?: () => string
  optimizeViaHost?: (draft: string, provider: string, model: string, signal: AbortSignal) => Promise<string>
  t?: (key: string) => string
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Wand (sparkle) glyph rendered as inline SVG, theme-aware via currentColor. */
function WandGlyph({ size }: { size: number }): JSX.Element {
  return createElement(
    'svg',
    {
      viewBox: '0 0 16 16',
      width: size,
      height: size,
      'aria-hidden': true,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    createElement('path', {
      d: 'M9.5 2.8 12.2 5.5 6.4 11.3l-2.7-2.7 5.8-5.8Z M13.8 1.2c.3 0 .5.2.5.5V3h1.2c.3 0 .5.2.5.5s-.2.5-.5.5H14v1.2c0 .3-.2.5-.5.5s-.5-.2-.5-.5V4h-1.2c-.3 0-.5-.2-.5-.5s.2-.5.5-.5H13V1.7c0-.3.2-.5.5-.5Z M4.2 12.4l.9.9-1.6 1.6-.9-.9 1.6-1.6Z',
    }),
  )
}

/**
 * Composer button: reads the draft from the session input store, sends it to
 * the host optimizer command, and writes the result back via setDraft.
 */
export function OptimizerButton(props: OptimizerButtonProps): JSX.Element | null {
  const { useInput, inputActions, useDirectory, loadDirectory, readTarget, optimizeViaHost, t } = props
  const input = useInput?.((s) => s)
  const directory = useDirectory?.((s) => s)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const attempt = useRef(0)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      attempt.current += 1
    }
  }, [])

  useEffect(() => {
    if (toast === null) return
    const timer = setTimeout(() => {
      if (mounted.current) setToast(null)
    }, 4000)
    return () => clearTimeout(timer)
  }, [toast])

  const run = useCallback(() => {
    const draft = input?.draft ?? ''
    if (draft.trim() === '') {
      setToast(t?.('emptyDraft') ?? 'Der Entwurf ist leer – nichts zu optimieren.')
      return
    }
    if (busy) return
    const request = ++attempt.current
    setBusy(true)
    setToast(null)
    void Promise.resolve()
      .then(async () => {
        if (directory !== undefined && (directory.groups.length === 0 || directory.status === 'idle')) {
          await loadDirectory?.()
        }
        const target = readTarget?.() ?? FALLBACK_TARGET
        const route = splitTarget(target)
        if (route === undefined) throw new Error(`Ungültiges Zielmodell: ${target}`)
        if (optimizeViaHost === undefined) throw new Error('Optimizer-Hostbefehl ist nicht verfügbar.')
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 30_000)
        try {
          return await optimizeViaHost(draft, route.provider, route.model, controller.signal)
        } finally {
          clearTimeout(timer)
        }
      })
      .then((optimized) => {
        if (!mounted.current || request !== attempt.current) return
        // eslint-disable-next-line no-console
        console.debug('[prompt-optimizer] draft optimized')
        inputActions?.setDraft(optimized)
      })
      .catch((error: unknown) => {
        if (!mounted.current || request !== attempt.current) return
        setToast(failureMessage(error))
      })
      .finally(() => {
        if (!mounted.current || request !== attempt.current) return
        setBusy(false)
      })
  }, [busy, directory, input, inputActions, loadDirectory, optimizeViaHost, readTarget, t])

  return createElement(
    'span',
    { style: { position: 'relative', display: 'inline-flex' } },
    createElement(
      'button',
      {
        type: 'button',
        'aria-label': t?.('buttonLabel') ?? 'Prompt optimieren',
        title: t?.('buttonLabel') ?? 'Prompt optimieren',
        disabled: busy || inputActions === undefined,
        onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
        onClick: run,
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: 8,
          border: 'none',
          background: 'transparent',
          color: 'var(--dsw-alias-label-secondary)',
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.6 : 1,
        },
      },
      busy
        ? createElement('span', {
            'aria-hidden': true,
            style: {
              width: 14,
              height: 14,
              borderRadius: '50%',
              border: '2px solid currentColor',
              borderTopColor: 'transparent',
              animation: 'po-spin 0.8s linear infinite',
            },
          })
        : createElement(WandGlyph, { size: 14 }),
    ),
    toast !== null
      ? createElement(
          'span',
          {
            role: 'alert',
            style: {
              position: 'absolute',
              bottom: 'calc(100% + 6px)',
              right: 0,
              maxWidth: 260,
              padding: '6px 10px',
              borderRadius: 8,
              background: 'var(--dsw-alias-bg-elevated)',
              color: 'var(--dsw-alias-label-primary)',
              fontSize: 12,
              lineHeight: '16px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
              zIndex: 10,
            },
          },
          toast,
        )
      : null,
  )
}

interface SettingsPanelProps {
  useDirectory?: (selector: (s: DirectorySnapshot) => DirectorySnapshot) => DirectorySnapshot
  loadDirectory?: () => Promise<unknown>
  readTarget?: () => string
  writeTarget?: (target: string) => Promise<void>
  t?: (key: string) => string
}

/** Settings page: model dropdown fed by the live model directory. */
export function OptimizerSettings(props: SettingsPanelProps): JSX.Element {
  const { useDirectory, loadDirectory, readTarget, writeTarget, t } = props
  const directory = useDirectory?.((s) => s)
  const [target, setTarget] = useState<string>(() => readTarget?.() ?? FALLBACK_TARGET)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadDirectory?.().catch((cause: unknown) => {
      setError(failureMessage(cause))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const options: Array<{ value: string; label: string }> = []
  for (const group of directory?.groups ?? []) {
    for (const model of group.models) {
      options.push({ value: `${group.id}/${model.id}`, label: `${group.name} / ${model.name}` })
    }
  }
  const currentValue = options.some((o) => o.value === target) ? target : (options[0]?.value ?? target)

  const onChange = (value: string): void => {
    setTarget(value)
    setSaving(true)
    setError(null)
    void Promise.resolve(writeTarget?.(value))
      .catch((cause: unknown) => setError(failureMessage(cause)))
      .finally(() => setSaving(false))
  }

  return createElement(
    'section',
    { style: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560 } },
    createElement(
      'header',
      null,
      createElement('h2', null, t?.('settingsTitle') ?? 'Prompt Optimizer'),
      createElement(
        'p',
        { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 13 } },
        t?.('settingsIntro') ??
          'Wählt das Modell, das Composer-Entwürfe optimiert. Die Liste stammt live aus der DSH-Konfiguration.',
      ),
    ),
    error !== null ? createElement('p', { role: 'alert', style: { color: 'var(--dsw-alias-danger)' } }, error) : null,
    createElement(
      'label',
      { style: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 } },
      createElement('span', null, t?.('modelLabel') ?? 'Optimierungs-Modell'),
      createElement(
        'select',
        {
          value: currentValue,
          disabled: saving || (directory?.status === 'loading' && options.length === 0),
          onChange: (e: { target: { value: string } }) => onChange(e.target.value),
          style: {
            padding: '8px 10px',
            borderRadius: 8,
            background: 'var(--dsw-alias-bg-elevated)',
            color: 'var(--dsw-alias-label-primary)',
            border: '1px solid var(--dsw-alias-border-l3)',
          },
        },
        options.length === 0
          ? createElement('option', { value: currentValue }, t?.('noModels') ?? 'Keine Modelle verfügbar')
          : options.map((o) => createElement('option', { key: o.value, value: o.value }, o.label)),
      ),
    ),
    saving ? createElement('p', { style: { fontSize: 12 } }, t?.('saving') ?? 'Speichert …') : null,
  )
}

const en = {
  buttonLabel: 'Optimize prompt',
  emptyDraft: 'The draft is empty — nothing to optimize.',
  settingsTitle: 'Prompt Optimizer',
  settingsIntro: 'Chooses the model that optimizes composer drafts. The list comes live from the DSH configuration.',
  modelLabel: 'Optimization model',
  noModels: 'No models available',
  saving: 'Saving…',
}

const de = {
  buttonLabel: 'Prompt optimieren',
  emptyDraft: 'Der Entwurf ist leer – nichts zu optimieren.',
  settingsTitle: 'Prompt Optimizer',
  settingsIntro: 'Wählt das Modell, das Composer-Entwürfe optimiert. Die Liste stammt live aus der DSH-Konfiguration.',
  modelLabel: 'Optimierungs-Modell',
  noModels: 'Keine Modelle verfügbar',
  saving: 'Speichert …',
}

/**
 * Client plugin body: composer button on `conversation.input.right` plus the
 * `settings.section` page with the live model dropdown.
 */
export function apply(ctx: ClientPluginContext): void {
  ctx.effect(() => {
    ctx.locale.register(NS, { en, de })
    return () => {}
  }, 'prompt-optimizer: dictionaries')
  const t = ctx.locale.bind(NS) as (key: string) => string

  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-prompt-optimizer'
    tag.textContent = '@keyframes po-spin { to { transform: rotate(360deg); } }'
    document.head.appendChild(tag)
    return () => {
      tag.remove()
    }
  }, 'prompt-optimizer: styles')

  const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE })
  const readTarget = (): string => {
    try {
      const value: unknown = scope.get(TARGET_FIELD)
      return typeof value === 'string' && value.includes('/') ? value : FALLBACK_TARGET
    } catch {
      return FALLBACK_TARGET
    }
  }
  const writeTarget = async (target: string): Promise<void> => {
    await scope.set(TARGET_FIELD, target)
  }

  const optimizeViaHost = async (draft: string, provider: string, model: string, signal: AbortSignal): Promise<string> => {
    const response: unknown = await ctx.connection.rpc.call('/api', 'promptOptimizer/optimize', {
      draft,
      provider,
      model,
    })
    if (signal.aborted) throw new Error('prompt-optimizer: abgebrochen')
    const ok = (response as { ok?: boolean } | null)?.ok
    const value = (response as { value?: { text?: unknown } })?.value
    if (ok === true && typeof value?.text === 'string') return value.text
    // Fallback: some transports resolve the value directly.
    if (typeof (response as { text?: unknown })?.text === 'string') {
      return (response as { text: string }).text
    }
    const message = (response as { error?: { message?: string } })?.error?.message
    throw new Error(typeof message === 'string' && message !== '' ? message : 'prompt-optimizer: Optimierung fehlgeschlagen')
  }

  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'prompt-optimizer',
        order: 40,
        label: () => t('settingsTitle'),
        locale: NS,
        inject: () => ({
          hooks: {},
          loadDirectory: async () => {},
          readTarget,
          writeTarget,
        }),
      },
      OptimizerSettings,
    ),
  )

  ctx.slots.inject('conversation.input.right', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.right',
        id: 'prompt-optimizer',
        order: 10,
        locale: NS,
        inject: (sessionId: string) => {
          const directory = ctx.modelDirectories.directoryFor(sessionId)
          return {
            hooks: { directory: directory.store },
            loadDirectory: async () => {
              await directory.load()
            },
            readTarget,
            optimizeViaHost,
          }
        },
      },
      OptimizerButton,
    ),
  )
}
