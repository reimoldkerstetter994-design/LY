export type CreateUserMessage = (input: {
  content: readonly { type: 'text', text: string }[]
  source: unknown
}) => unknown
