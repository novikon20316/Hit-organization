// src/scripts/uploadElectricalThesisSubmissionProcedure.ts
//
// One-off: uploads "נוהל הגשת עבודת מחקר (תזה)" (the Electrical & Electronics
// Engineering faculty's Thesis Submission Procedure, course 555XX) to
// Cloudinary and creates its infoFiles Firestore doc, scoped so it's visible
// ONLY to students matching ALL three: facultyId === 'electrical' AND
// degreeType === 'masters' AND track === 'thesis' (resolved server-side via
// config/studentTrack.ts's resolveEffectiveTrack — see
// infoFilesController.ts's new trackTypes axis, added alongside this
// script). A student missing any one of the three never sees this file —
// enforced in getInfoFiles, not just hidden client-side.
//
// Mirrors uploadInfoFile's own Cloudinary call (resource_type: 'raw', folder
// 'info-files') and Firestore doc shape exactly, so this file is
// indistinguishable from one uploaded through the normal admin UI (visible
// there, editable/deletable there) — just created via script since no
// system_admin/coordinator/supervisor test account was driving a real
// browser session.
//
// SAFE BY DEFAULT: dry run (prints what would happen, uploads/writes
// nothing) unless you pass --apply. Always run without --apply first.
//
// Usage (from server/):
//   npx tsx src/scripts/uploadElectricalThesisSubmissionProcedure.ts             # dry run
//   npx tsx src/scripts/uploadElectricalThesisSubmissionProcedure.ts --apply     # actually uploads + writes

import 'dotenv/config'; // config/firebase.ts doesn't load .env itself (only index.ts does) — needed here for CLOUDINARY_* below.
import fs from 'fs';
import admin from 'firebase-admin';
import { v2 as cloudinary } from 'cloudinary';
import { db } from '../config/firebase.js';

const APPLY = process.argv.includes('--apply');
const SEED_ACTOR = 'system-seed-script:uploadElectricalThesisSubmissionProcedure';

const LOCAL_FILE_PATH = 'C:\\Users\\dorno\\Desktop\\טפסים לאפליקציה של HIT\\‏‏פקולטה הנדסת חשמל ואלקטרוניקה\\תואר שני\\נוהל הגשת תזה.docx';
const TITLE_HE = 'נוהל הגשת עבודת מחקר (תזה)';
const TITLE_EN = 'Thesis Submission Procedure';

async function main() {
  console.log(APPLY ? 'APPLYING — file will be uploaded and the Firestore doc created.' : 'DRY RUN — pass --apply to actually upload/write.');
  console.log('');

  if (!fs.existsSync(LOCAL_FILE_PATH)) {
    console.error(`File not found: ${LOCAL_FILE_PATH}`);
    process.exit(1);
  }
  const stat = fs.statSync(LOCAL_FILE_PATH);
  console.log(`Local file: ${LOCAL_FILE_PATH} (${(stat.size / 1024).toFixed(1)} KB)`);

  const scope = {
    facultyIds: ['electrical'],
    majors: [] as string[], // electrical has only one masters major today; degreeType+facultyId already suffice
    degreeTypes: ['masters'],
    trackTypes: ['thesis'],
    projectIds: [] as string[],
  };
  console.log('Scope:', JSON.stringify(scope));
  console.log(`Title: ${TITLE_HE} / ${TITLE_EN}`);

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to actually upload the file and create the infoFiles doc.');
    return;
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
  });

  const result = await cloudinary.uploader.upload(LOCAL_FILE_PATH, {
    resource_type: 'raw',
    folder: 'info-files',
  });
  console.log(`Uploaded to Cloudinary: ${result.secure_url}`);

  const docRef = db.collection('infoFiles').doc();
  await docRef.set({
    titleHe: TITLE_HE,
    titleEn: TITLE_EN,
    fileUrl: result.secure_url,
    fileName: 'נוהל הגשת תזה.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    uploadedBy: SEED_ACTOR,
    facultyIds: scope.facultyIds,
    majors: scope.majors,
    degreeTypes: scope.degreeTypes,
    trackTypes: scope.trackTypes,
    projectIds: scope.projectIds,
    milestoneType: null,
    isVisible: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`Created infoFiles doc: ${docRef.id}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
