import * as decoding from 'lib0/decoding'

export const MESSAGE_SYNC = 0
export const MESSAGE_AWARENESS = 1

export type YjsMessageType = typeof MESSAGE_SYNC | typeof MESSAGE_AWARENESS

export interface DecodedYjsMessage {
  type: YjsMessageType
  decoder: decoding.Decoder
}

export function decodeMessage(data: Uint8Array): DecodedYjsMessage | null {
  try {
    const decoder = decoding.createDecoder(data)
    const type = decoding.readVarUint(decoder)

    if (type !== MESSAGE_SYNC && type !== MESSAGE_AWARENESS) {
      return null
    }

    return { type, decoder }
  } catch {
    return null
  }
}
