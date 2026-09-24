export type HostContext = any

export type SessionResumeOutcome = { ok: true } | { ok: false, code: number, error: string }

export interface PlatformModuleLoader {
  import: (name: string) => Promise<unknown>
  unwrapExports: (exports: unknown) => unknown
}

export interface SessionResumeResponse {
  ok?: boolean
  error?: string
}
