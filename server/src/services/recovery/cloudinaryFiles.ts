// src/services/recovery/cloudinaryFiles.ts
//
// Every uploaded file lives only in Cloudinary (milestone submissions,
// evaluation/grade files, applications, examiner opinions, info files, chat
// images/files, student photos, examiner tax/evaluation documents, the
// thesis template). Firestore holds either the full public URL or the
// public_id. This lists every asset, downloads it for the recovery file, and
// re-uploads it under the SAME public_id/type on restore — so every stored
// URL/public_id keeps working (Cloudinary serves the current asset for any
// version number in the URL; checked 2026-11-10).

import { v2 as cloudinary } from 'cloudinary';
import { createHash } from 'crypto';

export interface CloudinaryAsset {
  publicId: string;
  type: string;
  resourceType: string;
  format: string | null;
  bytes: number;
  createdAt: string | null;
  secureUrl: string | null;
}

const DELIVERY_TYPES = ['upload', 'authenticated', 'private'] as const;
const RESOURCE_TYPES = ['raw', 'image', 'video'] as const;

/** cloudinary.config() is done in index.ts for the API; the CLI and the
 *  Cloud Run Job import this module without index.ts, so configure here
 *  when needed (idempotent). */
export function ensureCloudinaryConfigured(): string | null {
  const name = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudinary.config().api_key && name) {
    cloudinary.config({ cloud_name: name, api_key: process.env.CLOUDINARY_API_KEY ?? '', api_secret: process.env.CLOUDINARY_API_SECRET ?? '' });
  }
  return cloudinary.config().cloud_name ?? name ?? null;
}

/** Lists every asset in the account (Admin API, 500 per call — a few calls
 *  per backup, well under the hourly Admin API limit). */
export async function listAllAssets(): Promise<CloudinaryAsset[]> {
  ensureCloudinaryConfigured();
  const out: CloudinaryAsset[] = [];
  for (const type of DELIVERY_TYPES) {
    for (const resource_type of RESOURCE_TYPES) {
      let next_cursor: string | undefined;
      do {
        const res = await cloudinary.api.resources({ type, resource_type, max_results: 500, ...(next_cursor ? { next_cursor } : {}) });
        for (const r of res.resources ?? []) {
          out.push({
            publicId: r.public_id,
            type: r.type ?? type,
            resourceType: r.resource_type ?? resource_type,
            format: r.format ?? null,
            bytes: Number(r.bytes ?? 0),
            createdAt: r.created_at ?? null,
            secureUrl: r.secure_url ?? null,
          });
        }
        next_cursor = res.next_cursor;
      } while (next_cursor);
    }
  }
  return out;
}

function downloadUrl(a: CloudinaryAsset): string {
  if (a.type === 'upload' && a.secureUrl) return a.secureUrl;
  if (a.type === 'private') {
    return cloudinary.utils.private_download_url(a.publicId, a.format ?? '', { resource_type: a.resourceType, type: 'private' });
  }
  // authenticated: a signed delivery URL. Raw public_ids already end in
  // their extension; images/videos need the format appended.
  return cloudinary.url(a.publicId, {
    resource_type: a.resourceType,
    type: a.type,
    sign_url: true,
    secure: true,
    ...(a.resourceType !== 'raw' && a.format ? { format: a.format } : {}),
  });
}

export async function downloadAsset(a: CloudinaryAsset): Promise<Buffer> {
  const res = await fetch(downloadUrl(a));
  if (!res.ok) throw new Error(`download ${a.type}/${a.resourceType}/${a.publicId} failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export function sha256Hex(b: Uint8Array): string {
  return createHash('sha256').update(b).digest('hex');
}

/** Re-uploads one file under its original public_id and delivery type.
 *  overwrite:false keeps an existing asset untouched (merge mode). */
export async function restoreAsset(meta: { publicId: string; type: string; resourceType: string; format: string | null }, bytes: Buffer, overwrite: boolean): Promise<'uploaded' | 'existed'> {
  ensureCloudinaryConfigured();
  const result = await new Promise<{ existing?: boolean }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id: meta.publicId,
        type: meta.type as 'upload' | 'authenticated' | 'private',
        resource_type: meta.resourceType as 'raw' | 'image' | 'video',
        overwrite,
        invalidate: overwrite,
        unique_filename: false,
        use_filename: false,
        ...(meta.resourceType !== 'raw' && meta.format ? { format: meta.format } : {}),
      },
      (err, res) => (err ? reject(err) : resolve((res ?? {}) as { existing?: boolean })),
    );
    stream.end(bytes);
  });
  return result.existing ? 'existed' : 'uploaded';
}
