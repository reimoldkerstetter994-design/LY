import type { EventHandlerRequest } from 'dsh-tauri'
import type { OpenSessionDirResult, SessionIdBody } from '../../../index.types'
import { defineEventHandler, readBody } from 'dsh-tauri'
import { session } from '../../../../service/session'

export default defineEventHandler<EventHandlerRequest, Promise<OpenSessionDirResult>>(async (event) => {
  const body = await readBody<SessionIdBody>(event, { type: 'json' })
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
  if (sessionId.length === 0) {
    event.res.status = 400
    return { ok: false as const, error: 'invalid-session-id' }
  }

  const result = await session.openDir(sessionId)
  if (!result.ok)
    event.res.status = 400
  return result
})
