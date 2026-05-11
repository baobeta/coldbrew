import { ref, onUnmounted } from 'vue'
import { nanoid } from 'nanoid'

export function usePages(ydoc, provider) {
  const pagesMap = ydoc.getMap('pages')
  const pageOrder = ydoc.getArray('pageOrder')
  const activePageId = ref(null)
  const pages = ref([])

  function syncPages() {
    const order = pageOrder.toArray()
    pages.value = order.map(id => {
      const meta = pagesMap.get(id)
      return { id, title: meta?.title || 'Untitled' }
    })
  }

  const pagesObserver = () => syncPages()
  const orderObserver = () => syncPages()
  pagesMap.observe(pagesObserver)
  pageOrder.observe(orderObserver)

  function createPage(title = 'Untitled') {
    const id = nanoid(8)
    ydoc.getXmlFragment(`page-${id}`)
    pagesMap.set(id, { title })
    pageOrder.push([id])
    activePageId.value = id
    broadcastActivePage(id)
    return id
  }

  function setActivePage(id) {
    activePageId.value = id
    broadcastActivePage(id)
  }

  function renamePage(id, newTitle) {
    const meta = pagesMap.get(id)
    if (meta) {
      pagesMap.set(id, { ...meta, title: newTitle })
    }
  }

  function deletePage(id) {
    if (pages.value.length <= 1) return
    const idx = pageOrder.toArray().indexOf(id)
    if (idx >= 0) pageOrder.delete(idx, 1)
    pagesMap.delete(id)
    if (activePageId.value === id) {
      activePageId.value = pages.value[0]?.id || null
      broadcastActivePage(activePageId.value)
    }
  }

  function getFragment(id) {
    return ydoc.getXmlFragment(`page-${id}`)
  }

  function broadcastActivePage(id) {
    provider.awareness.setLocalStateField('activePage', id)
  }

  syncPages()
  if (pages.value.length === 0) {
    createPage('Untitled')
  } else {
    activePageId.value = pages.value[0].id
    broadcastActivePage(activePageId.value)
  }

  onUnmounted(() => {
    pagesMap.unobserve(pagesObserver)
    pageOrder.unobserve(orderObserver)
  })

  return {
    pages,
    activePageId,
    createPage,
    setActivePage,
    renamePage,
    deletePage,
    getFragment,
  }
}
