import { decodePoints } from '@/features/canvas/strokeCodec';
import type { StrokeStyle } from '@/features/canvas/types';
import { BackupError } from './errors';
import { checkTextContent } from './textContent';

export { BackupError };

const BACKUP_FORMAT = 'coldbrew-backup';
const BACKUP_VERSION = 1;
const MAX_DEPTH = 32;
const MAX_STROKE_SIZE = 64;
const BYTES_CHUNK = 0x8000;

export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
export const MAX_PAGES = 2000;
export const MAX_FOLDERS = 2000;
export const MAX_TITLE_LENGTH = 500;

export interface BackupStroke extends StrokeStyle {
  pts: string; // base64 of the packed points
}

export type BackupNode =
  | { type: 'folder'; title: string; children: BackupNode[] }
  | { type: 'page'; kind: 'text'; title: string; content: unknown }
  | { type: 'page'; kind: 'canvas'; title: string; strokes: BackupStroke[] };

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  checksum: string;
  nodes: BackupNode[];
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += BYTES_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BYTES_CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

async function checksumOf(nodes: BackupNode[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(nodes));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createBackup(nodes: BackupNode[], exportedAt: string): Promise<BackupFile> {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    checksum: await checksumOf(nodes),
    nodes,
  };
}

function invalid(): BackupError {
  return new BackupError('The backup file is invalid.');
}

function requireObject(value: any, keys: string[]): void {
  const isObject = typeof value === 'object' && value !== null && !Array.isArray(value);
  if (!isObject) throw invalid();
  const actual = Object.keys(value);
  if (actual.length !== keys.length || !keys.every((key) => actual.includes(key))) throw invalid();
}

function checkStroke(stroke: any): void {
  requireObject(stroke, ['tool', 'color', 'size', 'simulatePressure', 'pts']);
  const valid =
    ['pen', 'highlighter'].includes(stroke.tool) &&
    typeof stroke.color === 'string' &&
    /^#[0-9a-f]{6}$/i.test(stroke.color) &&
    Number.isFinite(stroke.size) &&
    stroke.size > 0 &&
    stroke.size <= MAX_STROKE_SIZE &&
    typeof stroke.simulatePressure === 'boolean' &&
    typeof stroke.pts === 'string';
  if (!valid) throw invalid();
  decodePoints(base64ToBytes(stroke.pts));
}

function checkNode(node: any, depth: number, counter: { pages: number; folders: number }): void {
  if (depth > MAX_DEPTH) throw new BackupError('The backup is too deeply nested.');
  if (typeof node?.title !== 'string' || node.title.length > MAX_TITLE_LENGTH) throw invalid();
  if (node.type === 'folder') {
    requireObject(node, ['type', 'title', 'children']);
    if (!Array.isArray(node.children)) throw invalid();
    if (++counter.folders > MAX_FOLDERS) throw new BackupError('The backup has too many folders.');
    for (const child of node.children) checkNode(child, depth + 1, counter);
    return;
  }
  if (node.type !== 'page') throw invalid();
  if (++counter.pages > MAX_PAGES) throw new BackupError('The backup has too many pages.');
  if (node.kind === 'text') {
    requireObject(node, ['type', 'kind', 'title', 'content']);
    checkTextContent(node.content);
  } else if (node.kind === 'canvas') {
    requireObject(node, ['type', 'kind', 'title', 'strokes']);
    if (!Array.isArray(node.strokes)) throw invalid();
    node.strokes.forEach(checkStroke);
  } else {
    throw invalid();
  }
}

// A backup is untrusted input, so nothing is written to a room until this passes.
export async function parseBackup(text: string): Promise<BackupFile> {
  // Counts bytes, like file.size, so anything exported here can also be imported.
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) {
    throw new BackupError('The backup file is too large.');
  }
  try {
    const file = JSON.parse(text);
    if (file?.format !== BACKUP_FORMAT) throw new BackupError('This is not a Coldbrew backup.');
    if (file.version > BACKUP_VERSION) {
      throw new BackupError('This backup was made by a newer version of the app.');
    }
    if (file.version !== BACKUP_VERSION) throw invalid();
    requireObject(file, ['format', 'version', 'exportedAt', 'checksum', 'nodes']);
    if (typeof file.exportedAt !== 'string' || Number.isNaN(Date.parse(file.exportedAt))) {
      throw invalid();
    }
    if (!Array.isArray(file.nodes)) throw invalid();
    const counter = { pages: 0, folders: 0 };
    for (const node of file.nodes) checkNode(node, 1, counter);
    if (file.checksum !== (await checksumOf(file.nodes))) {
      throw new BackupError('The backup file is damaged.');
    }
    return file;
  } catch (error) {
    throw error instanceof BackupError ? error : invalid();
  }
}
