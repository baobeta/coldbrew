import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';
import { BackupError } from './errors';

const schema = getSchema([StarterKit]);
const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };
const SAFE_LINK_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

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

export function checkTextContent(content: unknown): void {
  const doc = schema.nodeFromJSON(content);
  doc.check();
  if (doc.type !== schema.topNodeType) throw new BackupError('The backup has invalid text.');
  doc.descendants((node) => {
    if (node.marks.some((mark) => mark.type.name === 'link' && !isSafeLink(mark.attrs.href))) {
      throw new BackupError('The backup contains an unsafe link.');
    }
  });
}
