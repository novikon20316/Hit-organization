import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../src/firebase/firebase';
// ─────────────────────────────────────────────────────────────────────────────
// HOW TO CREATE YOUR SYSTEM ADMIN USER IN FIRESTORE
// ─────────────────────────────────────────────────────────────────────────────
//
// Step 1: Log in with your admin email in the app (creates the Firebase Auth user)
// Step 2: Copy the UID from the console log (🔥 AUTH STATE — UID: xxxxxx)
// Step 3: Go to Firebase Console → Firestore → users collection
// Step 4: Create a document with ID = that UID
// Step 5: Paste the fields below
//
// OR use the dev button in your login screen to run the script at the bottom.
// ─────────────────────────────────────────────────────────────────────────────


// ─── EXACT document to create in Firestore ───────────────────────────────────
// Collection: users
// Document ID: <your Firebase Auth UID>

const ADMIN_USER_DOC = {
  // ── Identity ────────────────────────────────────────────────────────────────
  uid:             "PASTE_YOUR_UID_HERE",     // must match the document ID
  email:           "admin@hit.ac.il",         // your admin email
  displayName:     "מנהל מערכת",              // shown in the top bar
  displayNameHe:   "מנהל מערכת",
  displayNameEn:   "System Admin",

  // ── Role — THIS is what the Firestore rules check ───────────────────────────
  role:            "system_admin",            // ← critical field

  // ── Faculty — system_admin bypasses faculty checks, but field must exist ────
  facultyId:       "all",                     // "all" = cross-faculty access

  // ── Additional roles (empty for admin) ─────────────────────────────────────
  additionalRoles: [],

  // ── Student fields — null for staff ─────────────────────────────────────────
  degreeType:      null,
  yearOfStudy:     null,
  studentId:       null,
  major:           null,

  // ── Flags ───────────────────────────────────────────────────────────────────
  isActive:        true,
  profileComplete: true,
  hasActiveProject:false,

  // ── Preferences ─────────────────────────────────────────────────────────────
  language:        "he",                      // "he" or "en"

  // ── Push notifications ───────────────────────────────────────────────────────
  expoPushToken:   null,                      // filled automatically on login

  // ── Timestamps (set these in Firestore console as Timestamp type) ────────────
  // createdAt:  <Timestamp>
  // lastLoginAt:<Timestamp>
};


// ─── Quick-create documents for other roles (copy as needed) ─────────────────

const SUPERVISOR_DOC = {
  uid:             "SUPERVISOR_UID",
  email:           "supervisor@hit.ac.il",
  displayName:     "ד\"ר ישראל ישראלי",
  displayNameHe:   "ד\"ר ישראל ישראלי",
  displayNameEn:   "Dr. Israel Israeli",
  role:            "supervisor",             // ← must be exactly this string
  facultyId:       "computer_science",       // must match a key in FACULTY_COLORS
  additionalRoles: [],
  degreeType:      null,
  yearOfStudy:     null,
  studentId:       null,
  major:           null,
  isActive:        true,
  profileComplete: true,
  hasActiveProject:false,
  language:        "he",
  expoPushToken:   null,
};

const COORDINATOR_DOC = {
  uid:             "COORDINATOR_UID",
  email:           "coordinator@hit.ac.il",
  displayName:     "רכז הפרויקטים",
  displayNameHe:   "רכז הפרויקטים",
  displayNameEn:   "Project Coordinator",
  role:            "coordinator",            // ← must be exactly this string
  facultyId:       "computer_science",
  additionalRoles: [],
  degreeType:      null,
  yearOfStudy:     null,
  studentId:       null,
  major:           null,
  isActive:        true,
  profileComplete: true,
  hasActiveProject:false,
  language:        "he",
  expoPushToken:   null,
};

const STUDENT_DOC = {
  uid:             "STUDENT_UID",
  email:           "student@hit.ac.il",
  displayName:     "דוד כהן",
  displayNameHe:   "דוד כהן",
  displayNameEn:   "David Cohen",
  role:            "student",                // ← must be exactly this string
  facultyId:       "computer_science",
  additionalRoles: [],
  degreeType:      "bachelors",              // "bachelors" or "masters"
  yearOfStudy:     3,                        // number: 1, 2, 3, or 4
  major:           "computer_science",       // must match a key in DEGREE_LENGTHS
  studentId:       null,                     // "123456789" if you add it later
  isActive:        true,
  profileComplete: true,
  hasActiveProject:false,
  language:        "he",
  expoPushToken:   null,
};

const EXAMINER_DOC = {
  uid:             "EXAMINER_UID",
  email:           "examiner@hit.ac.il",
  displayName:     "פרופ' שרה לוי",
  displayNameHe:   "פרופ' שרה לוי",
  displayNameEn:   "Prof. Sarah Levi",
  role:            "examiner",               // ← must be exactly this string
  facultyId:       "computer_science",
  additionalRoles: [],
  degreeType:      null,
  yearOfStudy:     null,
  studentId:       null,
  major:           null,
  isActive:        true,
  profileComplete: true,
  hasActiveProject:false,
  language:        "he",
  expoPushToken:   null,
  dates:[],
};


// ─── Script: run this from your login page DEV button ────────────────────────
// Replace the existing "Create Test User" button logic with this.
// It creates the correct doc for whoever is currently logged in.



export async function createAdminUserDoc() {
  const user = auth.currentUser;
  if (!user) {
    console.warn('⚠️ Log in first, then run this.');
    return;
  }

  await setDoc(doc(db, 'users', user.uid), {
    uid:             user.uid,
    email:           user.email,
    displayName:     user.displayName ?? 'System Admin',
    displayNameHe:   'מנהל מערכת',
    displayNameEn:   'System Admin',

    // ── THE CRITICAL FIELD ──
    role:            'system_admin',

    facultyId:       'all',
    additionalRoles: [],
    degreeType:      null,
    yearOfStudy:     null,
    studentId:       null,
    major:           null,
    isActive:        true,
    profileComplete: true,
    hasActiveProject:false,
    language:        'he',
    expoPushToken:   null,
    createdAt:       serverTimestamp(),
    lastLoginAt:     serverTimestamp(),
  });

  console.log('✅ Admin doc created for UID:', user.uid);
}

export async function createCoordinator() {
  try {
    // 1. Create auth account
    const cred = await createUserWithEmailAndPassword(
      auth,
      'coordinator@hit.ac.il',
      '12345678'
    );

    const uid = cred.user.uid;

    // 2. Create Firestore user document
    await setDoc(doc(db, 'users', uid), {
      uid,
      email: 'coord@hit.ac.il',

      displayName: 'רכז הפרויקטים',
      displayNameHe: 'רכז הפרויקטים',
      displayNameEn: 'Project Coordinator',

      role: 'coordinator',

      facultyId: 'computer_science',

      additionalRoles: [],

      degreeType: null,
      yearOfStudy: null,
      studentId: null,
      major: null,

      isActive: true,
      profileComplete: true,
      hasActiveProject: false,

      language: 'he',
      expoPushToken: null,

      createdAt: serverTimestamp(),
    });

    console.log('✅ Coordinator created');
  } catch (e) {
    console.error('❌ Error creating coordinator:', e);
  }
};

// ─── Valid role values (copy exactly — case sensitive) ────────────────────────
//
//   "student"
//   "supervisor"
//   "examiner"
//   "coordinator"
//   "faculty_admin"
//   "system_admin"
//
// ─── Valid facultyId values ───────────────────────────────────────────────────
//
//   "computer_science"
//   "electrical"
//   "software"
//   "industrial"
//   "mechanical"
//   "learning_technology"
//   "all"              ← system_admin only
//
// ─────────────────────────────────────────────────────────────────────────────