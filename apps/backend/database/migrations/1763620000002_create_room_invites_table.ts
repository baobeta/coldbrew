import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'room_invites'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.integer('room_id').unsigned().notNullable().references('rooms.id').onDelete('CASCADE')
      table.string('token_hash', 128).notNullable().unique()
      table.enum('role', ['editor', 'viewer']).notNullable().defaultTo('editor')
      table.timestamp('expires_at').nullable()
      table.timestamp('used_at').nullable()
      table.timestamp('created_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
