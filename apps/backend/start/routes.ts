/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

const accessTokensController = () => import('#controllers/access_tokens_controller')
const healthController = () => import('#controllers/http/health_controller')
const metricsController = () => import('#controllers/http/metrics_controller')
const newAccountController = () => import('#controllers/new_account_controller')
const profileController = () => import('#controllers/profile_controller')
const roomInvitesController = () => import('#controllers/http/room_invites_controller')
const roomsController = () => import('#controllers/http/rooms_controller')

router.get('/', () => {
  return { hello: 'world' }
})

router.get('/health', [healthController, 'show'])
router.get('/metrics', [metricsController, 'show'])

router
  .group(() => {
    router
      .group(() => {
        router.post('signup', [newAccountController, 'store'])
        router.post('login', [accessTokensController, 'store'])
      })
      .prefix('auth')
      .as('auth')

    router.post('rooms', [roomsController, 'store'])
    router.get('rooms/:slug', [roomsController, 'show'])

    router
      .group(() => {
        router.get('rooms', [roomsController, 'index'])
        router.patch('rooms/:slug', [roomsController, 'update'])
        router.post('rooms/:slug/invites', [roomInvitesController, 'store'])
      })
      .use(middleware.auth())

    router
      .group(() => {
        router.get('profile', [profileController, 'show'])
        router.post('logout', [accessTokensController, 'destroy'])
      })
      .prefix('account')
      .as('profile')
      .use(middleware.auth())
  })
  .prefix('/api/v1')
