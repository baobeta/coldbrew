import { shallowRef, watch } from 'vue';
import type { View } from '../types';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const DEFAULT_VIEW: View = { x: 0, y: 0, zoom: 1 };

export function screenToCanvas(view: View, x: number, y: number): [number, number] {
  return [(x - view.x) / view.zoom, (y - view.y) / view.zoom];
}

export function canvasToScreen(view: View, x: number, y: number): [number, number] {
  return [x * view.zoom + view.x, y * view.zoom + view.y];
}

export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

// Keeps the canvas point under the screen point in place, so zoom follows the pointer.
export function zoomAt(view: View, screenX: number, screenY: number, factor: number): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
  const [canvasX, canvasY] = screenToCanvas(view, screenX, screenY);
  return { zoom, x: screenX - canvasX * zoom, y: screenY - canvasY * zoom };
}

function storageKey(pageId: string): string {
  return `writeboard-canvas-view-${pageId}`;
}

export function loadView(pageId: string): View {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(pageId)) ?? 'null');
    const valid = [saved?.x, saved?.y, saved?.zoom].every(Number.isFinite) && saved.zoom > 0;
    return valid ? saved : DEFAULT_VIEW;
  } catch {
    return DEFAULT_VIEW;
  }
}

function saveView(pageId: string, view: View): void {
  try {
    localStorage.setItem(storageKey(pageId), JSON.stringify(view));
  } catch {
    // Losing the saved view is harmless, and storage can be blocked in private mode.
  }
}

export function useViewport(pageId: string) {
  const view = shallowRef<View>(loadView(pageId));
  watch(view, (next) => saveView(pageId, next));

  return {
    view,
    pan: (dx: number, dy: number) => {
      view.value = panBy(view.value, dx, dy);
    },
    zoom: (screenX: number, screenY: number, factor: number) => {
      view.value = zoomAt(view.value, screenX, screenY, factor);
    },
  };
}
