import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';
import { BackupError } from './errors';

const schema = getSchema([StarterKit]);
type ProseMirrorNode = ReturnType<typeof schema.nodeFromJSON>;
type Mark = ProseMirrorNode['marks'][number];

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };
const MAX_TEXT_DEPTH = 64;
const CODE_LANGUAGE = /^[\w+#.-]{1,40}$/;
const LINK_TARGETS = new Set([null, '_blank', '_self']);
// Matches what Tiptap's Link allows, so any link the editor accepts can be backed up.
const SAFE_LINK_SCHEMES = new Set([
  'http',
  'https',
  'ftp',
  'ftps',
  'mailto',
  'tel',
  'callto',
  'sms',
  'cid',
  'xmpp',
]);

function isSafeLink(href: unknown): boolean {
  if (typeof href !== 'string') return false;
  // Browsers ignore control characters and spaces here, so `java\nscript:` still runs.
  // eslint-disable-next-line no-control-regex
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href.replace(/[\u0000- ]/g, ''));
  return !scheme || SAFE_LINK_SCHEMES.has(scheme[1].toLowerCase());
}

// A page that was never opened has an empty fragment, which isn't a valid document.
export function readText(fragment: Y.XmlFragment): unknown {
  const content = yXmlFragmentToProsemirrorJSON(fragment);
  return content.content?.length ? content : EMPTY_DOC;
}

export function writeText(fragment: Y.XmlFragment, content: unknown): void {
  prosemirrorJSONToYXmlFragment(schema, content, fragment);
}

function checkMark(mark: Mark): void {
  if (mark.type.name !== 'link') return;
  const { href, class: className, target } = mark.attrs;
  // A class could turn a link into an invisible overlay, so only the defaults are allowed.
  if (!isSafeLink(href) || className !== null || !LINK_TARGETS.has(target)) {
    throw new BackupError('The backup contains an unsafe link.');
  }
}

function hasValidAttrs(node: ProseMirrorNode): boolean {
  const { level, start, language } = node.attrs;
  switch (node.type.name) {
    case 'heading':
      return Number.isInteger(level) && level >= 1 && level <= 6;
    case 'orderedList':
      return Number.isInteger(start);
    case 'codeBlock':
      return language === null || (typeof language === 'string' && CODE_LANGUAGE.test(language));
    default:
      return true;
  }
}

function checkNode(node: ProseMirrorNode, depth: number): void {
  if (depth > MAX_TEXT_DEPTH || !hasValidAttrs(node)) {
    throw new BackupError('The backup has invalid text.');
  }
  node.marks.forEach(checkMark);
  node.forEach((child) => checkNode(child, depth + 1));
}

export function checkTextContent(content: unknown): void {
  const doc = schema.nodeFromJSON(content);
  doc.check();
  if (doc.type !== schema.topNodeType) throw new BackupError('The backup has invalid text.');
  checkNode(doc, 0);
}
