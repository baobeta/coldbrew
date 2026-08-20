import { LeveldbPersistence } from 'y-leveldb'
import * as Y from 'yjs'

export default class PersistenceService {
  #storeCounts = new Map<string, number>()
  #ldb: LeveldbPersistence | null = null
  #compactEvery = 100

  constructor(private readonly leveldbPath: string) {}

  get path(): string {
    return this.leveldbPath
  }

  async loadRoom(roomName: string, doc: Y.Doc): Promise<void> {
    const persisted = await this.#db().getYDoc(roomName)
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(persisted))
  }

  async storeRoom(roomName: string, doc: Y.Doc): Promise<void> {
    const db = this.#db()
    await db.storeUpdate(roomName, Y.encodeStateAsUpdate(doc))

    const count = (this.#storeCounts.get(roomName) ?? 0) + 1
    if (count >= this.#compactEvery) {
      this.#storeCounts.set(roomName, 0)
      await db.flushDocument(roomName)
      return
    }

    this.#storeCounts.set(roomName, count)
  }

  async flushAndReload(roomName: string, doc: Y.Doc): Promise<Y.Doc> {
    const db = this.#db()
    await db.storeUpdate(roomName, Y.encodeStateAsUpdate(doc))
    await db.flushDocument(roomName)

    const check = new Y.Doc()
    const persisted = await db.getYDoc(roomName)
    Y.applyUpdate(check, Y.encodeStateAsUpdate(persisted))
    return check
  }

  async close(): Promise<void> {
    await this.#ldb?.destroy?.()
    this.#ldb = null
  }

  #db(): LeveldbPersistence {
    this.#ldb ??= new LeveldbPersistence(this.leveldbPath)
    return this.#ldb
  }
}
