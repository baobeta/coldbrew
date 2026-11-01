import { describe, it, expect } from 'vitest';
import { commandForKey, isTypingTarget } from '../shortcuts';

const key = (value: string, modifiers = {}) => ({
  key: value,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...modifiers,
});

describe('commandForKey', () => {
  it('maps tool and size keys', () => {
    expect(commandForKey(key('p'))).toBe('pen');
    expect(commandForKey(key('H'))).toBe('highlighter');
    expect(commandForKey(key('e'))).toBe('eraser');
    expect(commandForKey(key('['))).toBe('size-down');
    expect(commandForKey(key(']'))).toBe('size-up');
  });

  it('maps undo and redo on both platforms', () => {
    expect(commandForKey(key('z', { metaKey: true }))).toBe('undo');
    expect(commandForKey(key('z', { ctrlKey: true }))).toBe('undo');
    expect(commandForKey(key('Z', { metaKey: true, shiftKey: true }))).toBe('redo');
  });

  it('leaves browser shortcuts alone', () => {
    expect(commandForKey(key('p', { metaKey: true }))).toBe(null);
    expect(commandForKey(key('e', { altKey: true }))).toBe(null);
  });

  it('ignores other keys', () => {
    expect(commandForKey(key('x'))).toBe(null);
  });
});

describe('isTypingTarget', () => {
  it('detects inputs and editable elements', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(isTypingTarget(editable)).toBe(true);
  });

  it('allows other elements', () => {
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
