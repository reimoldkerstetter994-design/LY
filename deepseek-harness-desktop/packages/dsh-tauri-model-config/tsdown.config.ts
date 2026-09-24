import { defineDshConfig } from '../dsh-tauri-tsdown/src/index.ts'

export default defineDshConfig({
  client: {
    dts: true,
    noExternal: ['react-if-lite'],
  },
})
