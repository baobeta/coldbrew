import { Extension } from '@tiptap/core'
import { yCursorPlugin, defaultSelectionBuilder } from '@tiptap/y-tiptap'

interface CursorUser {
  name: string | null
  color: string | null
}

const CollaborationCursor = Extension.create({
  name: 'collaborationCursor',

  addOptions() {
    return {
      provider: null as any,
      user: { name: null, color: null } as CursorUser,
      render: (user: CursorUser): HTMLElement => {
        const cursor = document.createElement('span')
        cursor.classList.add('collaboration-cursor__caret')
        cursor.setAttribute('style', `border-color: ${user.color}`)
        const label = document.createElement('div')
        label.classList.add('collaboration-cursor__label')
        label.setAttribute('style', `background-color: ${user.color}`)
        label.insertBefore(document.createTextNode(user.name ?? ''), null)
        cursor.insertBefore(label, null)
        return cursor
      },
      selectionRender: defaultSelectionBuilder,
    }
  },

  addProseMirrorPlugins() {
    const awareness = this.options.provider.awareness
    awareness.setLocalStateField('user', this.options.user)

    return [
      yCursorPlugin(awareness, {
        cursorBuilder: this.options.render,
        selectionBuilder: this.options.selectionRender,
      }),
    ]
  },
})

export default CollaborationCursor
