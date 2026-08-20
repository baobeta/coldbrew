import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'rooms'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('slug', 64).notNullable().unique()
      table.string('name', 120).notNullable()
      table.enum('visibility', ['public', 'unlisted', 'private']).notNullable().defaultTo('public')
      table.integer('owner_id').unsigned().nullable().references('users.id').onDelete('SET NULL')
      table.timestamp('last_active_at').nullable()
      table.timestamp('deleted_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
