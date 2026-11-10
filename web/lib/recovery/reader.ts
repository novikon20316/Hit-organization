// web/lib/recovery/reader.ts — streams a .hitrec file in the browser:
// decrypt (format.ts) → gunzip (DecompressionStream) → entries. No Firebase
// imports, so it can be tested in Node too (same WebCrypto/streams APIs).

import { EntryParser, RecoveryDecryptor, type KeyKit, type RecoveryEntryMeta } from './format';

export async function readRecoveryFile(
  file: Blob,
  kit: KeyKit,
  onEntry: (meta: RecoveryEntryMeta, body: Uint8Array) => Promise<void>,
  onProgress?: (bytesRead: number, total: number) => void,
): Promise<void> {
  const decryptor = new RecoveryDecryptor(kit);
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter() as WritableStreamDefaultWriter<BufferSource>;
  const parser = new EntryParser();
  let consumerError: unknown = null;

  const produce = async () => {
    const reader = file.stream().getReader();
    let read = 0;
    try {
      for (;;) {
        if (consumerError) throw consumerError;
        const { done, value } = await reader.read();
        if (done) break;
        read += value.length;
        onProgress?.(read, file.size);
        for (const plain of await decryptor.feed(value)) await writer.write(new Uint8Array(plain));
      }
      decryptor.end();
      await writer.close();
    } catch (err) {
      await writer.abort(err).catch(() => undefined);
      throw err;
    }
  };

  const consume = async () => {
    const reader = ds.readable.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const e of parser.feed(value)) await onEntry(e.meta, e.body);
      }
      parser.end();
    } catch (err) {
      consumerError = err;
      await reader.cancel(err).catch(() => undefined);
      throw err;
    }
  };

  const results = await Promise.allSettled([produce(), consume()]);
  // Prefer the decryption/integrity error (it explains the other one).
  const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  if (failed) throw failed.reason;
}
