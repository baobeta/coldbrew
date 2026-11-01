import { onUnmounted, shallowRef } from 'vue';
import type { InkPoint, StrokeStyle } from '../types';

const SEND_INTERVAL_MS = 50;

export interface InkUpdate extends StrokeStyle {
  id: string;
  pts: InkPoint[];
}

export interface LivePreview extends StrokeStyle {
  id: string;
  points: InkPoint[];
}

export function useLivePreview(awareness: any, onChange: () => void) {
  const previews = shallowRef(new Map<number, LivePreview>());
  let lastSentAt = -Infinity;

  function receive(clientId: number, update: InkUpdate | null | undefined): void {
    const current = previews.value.get(clientId);
    if (!update) previews.value.delete(clientId);
    else if (current?.id === update.id) current.points.push(...update.pts);
    else previews.value.set(clientId, { ...update, points: [...update.pts] });
  }

  // Only `added` and `updated` clients are read. Reading every client would append
  // their last chunk again whenever anyone else's awareness changes.
  function onAwarenessChange({
    added,
    updated,
    removed,
  }: {
    added: number[];
    updated: number[];
    removed: number[];
  }): void {
    const states = awareness.getStates();
    for (const clientId of [...added, ...updated]) {
      if (clientId !== awareness.clientID) receive(clientId, states.get(clientId)?.ink);
    }
    for (const clientId of removed) previews.value.delete(clientId);
    onChange();
  }

  // Sends only new points, so a long stroke costs the same per update as a short one.
  function publish(
    id: string,
    style: StrokeStyle,
    takeUnsent: () => InkPoint[],
    now: number,
  ): void {
    if (now - lastSentAt < SEND_INTERVAL_MS) return;
    const pts = takeUnsent();
    if (!pts.length) return;
    lastSentAt = now;
    awareness.setLocalStateField('ink', { ...style, id, pts });
  }

  function clear(): void {
    lastSentAt = -Infinity;
    awareness.setLocalStateField('ink', null);
  }

  awareness.on('change', onAwarenessChange);
  onUnmounted(() => {
    awareness.off('change', onAwarenessChange);
    clear();
  });

  return { previews, publish, clear };
}
