import { test } from '@japa/runner'

test.group('health', () => {
  test('returns backend and yjs runtime status', async ({ client, assert }) => {
    const response = await client.get('/health')

    response.assertStatus(200)
    assert.equal(response.body().status, 'ok')
    assert.equal(response.body().app, 'writeboard-backend')
    assert.equal(response.body().yjs.websocketPath, '/sync')
  })
})
