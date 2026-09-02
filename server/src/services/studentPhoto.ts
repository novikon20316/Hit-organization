// src/services/studentPhoto.ts
//
// The one place in this app that stores an image as `type: 'authenticated'`
// rather than Cloudinary's default `type: 'upload'` — every other upload
// (milestone files, staff records, CVs/transcripts) is a document, not a
// personal photo, and is stored as plain public `upload` resources (see
// milestoneController.ts/supervisorController.ts). A student's face photo is
// personal data in a way those aren't, so its plain secure_url must 401 for
// anyone without a Cloudinary-signed link — resolveStudentPhotoUrl below is
// the only way to get a URL that actually renders it.
//
// Firestore only ever stores the Cloudinary `public_id` (on
// users/{uid}.photoPublicId) — never a signed URL — so a URL is always
// generated fresh from the current API secret, rather than a stored link
// silently going stale if the secret is ever rotated.

import { v2 as cloudinary } from 'cloudinary';

const FOLDER = 'studentPhotos';

/** Uploads (or replaces — public_id is pinned to the uid, `overwrite: true`)
 *  a student's profile photo. Returns the Cloudinary public_id to persist on
 *  the user doc; never returns a URL (see file header — URLs are generated
 *  on demand, not stored). */
export async function uploadStudentPhoto(uid: string, file: { buffer: Buffer; mimetype: string }): Promise<{ publicId: string }> {
  const base64 = file.buffer.toString('base64');
  const dataUri = `data:${file.mimetype};base64,${base64}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    resource_type: 'image',
    type: 'authenticated',
    folder: FOLDER,
    public_id: uid,
    overwrite: true,
  });
  return { publicId: result.public_id };
}

/** Generates a signed delivery URL for an `authenticated`-type photo — a
 *  plain/unsigned URL to the same asset 401s, so this is the only way a
 *  client ever actually sees the image. `sign_url: true` embeds a
 *  Cloudinary-API-secret-derived signature Cloudinary itself validates;
 *  `null` in means "this user has no photo yet". */
export function resolveStudentPhotoUrl(publicId: string | null | undefined): string | null {
  if (!publicId) return null;
  return cloudinary.url(publicId, {
    resource_type: 'image',
    type: 'authenticated',
    sign_url: true,
    secure: true,
  });
}
