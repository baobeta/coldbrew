declare module 'y-leveldb' {
  import type * as Y from 'yjs'

  export class LeveldbPersistence {
    constructor(location: string)
    getYDoc(docName: string): Promise<Y.Doc>
    storeUpdate(docName: string, update: Uint8Array): Promise<void>
    flushDocument(docName: string): Promise<void>
    destroy?(): Promise<void>
  }
}
