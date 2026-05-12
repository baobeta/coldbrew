import type { Doc } from 'yjs';
import type { Ref } from 'vue';

export interface TreeNode {
  id: string;
  type: 'page' | 'folder';
  title: string;
  children?: TreeNode[];
}

export interface Participant {
  clientId: number;
  name: string;
  color: string;
  speaking: boolean;
  isLocal: boolean;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface CollaborationReturn {
  ydoc: Doc;
  provider: any;
  userName: string | null;
  userColor: string;
  peerCount: Ref<number>;
  participants: Ref<Participant[]>;
  connectionStatus: Ref<ConnectionStatus>;
}
