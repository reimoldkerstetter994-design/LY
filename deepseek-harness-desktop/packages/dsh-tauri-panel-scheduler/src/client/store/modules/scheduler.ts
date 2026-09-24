import type { SchedulerUiState } from './scheduler.types'
import { defineStore } from 'dsh-tauri/client'

const READ_AT_KEY = 'dsh.scheduler.readAt'
const READ_IDS_KEY = 'dsh.scheduler.readIds'

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key)
  }
  catch {
    return null
  }
}

function persist(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  }
  catch {
    // 持久化不可用（无 localStorage / 配额）时退化为内存态，本次会话内角标照常工作
  }
}

function readPersistedAt(): number {
  const parsed = Number(readRaw(READ_AT_KEY))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function readPersistedIds(): string[] {
  const raw = readRaw(READ_IDS_KEY)
  if (raw === null)
    return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  }
  catch {
    return []
  }
}

export const scheduler = defineStore({
  state: (): SchedulerUiState => ({
    tasks: [],
    runs: [],
    options: { workspaces: [], permissions: [], defaultPermission: 'read-only', models: [], failures: [], defaultModel: null },
    loading: false,
    error: '',
    refreshedAt: 0,
    loadToken: 0,
    readAt: readPersistedAt(),
    readIds: readPersistedIds(),
  }),
  actions: {
    /** 首次载入播种为「此刻已读」：已有历史不再算未读，之后新增的运行才未读。 */
    seedReadAt() {
      if (this.readAt !== 0)
        return
      this.readAt = Date.now()
      persist(READ_AT_KEY, String(this.readAt))
    },
    markRunRead(id: string) {
      if (this.readIds.includes(id))
        return
      this.readIds = [...this.readIds, id]
      persist(READ_IDS_KEY, JSON.stringify(this.readIds))
    },
    /** 会话区里打开了某条运行记录的会话：把它记的未读一并消掉。 */
    markSessionRead(sessionId: string) {
      const next = [...new Set([
        ...this.readIds,
        ...this.runs.filter(run => run.sessionId === sessionId).map(run => run.id),
      ])]
      if (next.length === this.readIds.length)
        return
      this.readIds = next
      persist(READ_IDS_KEY, JSON.stringify(next))
    },
    markAllRunsRead() {
      this.readAt = Date.now()
      this.readIds = []
      persist(READ_AT_KEY, String(this.readAt))
      persist(READ_IDS_KEY, '[]')
    },
  },
})
