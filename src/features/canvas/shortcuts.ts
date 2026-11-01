export type CanvasCommand =
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'size-down'
  | 'size-up'
  | 'undo'
  | 'redo';

const KEY_COMMANDS: Record<string, CanvasCommand> = {
  p: 'pen',
  h: 'highlighter',
  e: 'eraser',
  '[': 'size-down',
  ']': 'size-up',
};

type Shortcut = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>;

export function commandForKey(event: Shortcut): CanvasCommand | null {
  const key = event.key.toLowerCase();
  if (event.metaKey || event.ctrlKey) {
    if (key !== 'z' || event.altKey) return null;
    return event.shiftKey ? 'redo' : 'undo';
  }
  if (event.altKey) return null;
  return KEY_COMMANDS[key] ?? null;
}

// Shortcuts must not fire while someone types, such as when renaming a page.
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
