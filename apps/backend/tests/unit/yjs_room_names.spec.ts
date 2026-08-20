import { test } from '@japa/runner'
import {
  isPageRoomName,
  pageRoomName,
  roomIdFromTreeRoomName,
  treeRoomName,
} from '#services/yjs/room_names'

test.group('Yjs room names', () => {
  test('builds tree and page room names with current frontend convention', ({ assert }) => {
    assert.equal(treeRoomName('abc123'), 'writeboard-abc123')
    assert.equal(pageRoomName('abc123', 'pageA'), 'writeboard-abc123--page--pageA')
  })

  test('detects page rooms and extracts tree room ids', ({ assert }) => {
    assert.isTrue(isPageRoomName('writeboard-abc123--page--pageA'))
    assert.equal(roomIdFromTreeRoomName('writeboard-abc123'), 'abc123')
  })

  test('rejects invalid room identifiers', ({ assert }) => {
    assert.throws(() => treeRoomName('../bad'))
    assert.throws(() => pageRoomName('roomA', '../bad'))
  })
})
