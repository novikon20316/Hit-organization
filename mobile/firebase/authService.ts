import { auth } from "../src/firebase/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { apiClient } from "../src/api/apiClient";

// ----------------------
// SIGN UP (CREATE USER)
// ----------------------
export const registerUser = async (
  email: string,
  password: string,
  role: "student" | "supervisor" | "examiner" | "coordinator" | "faculty_admin" | "system_admin",
  displayNameHe: string,
  displayNameEn: string,
  facultyId: string
) => {
  // 1. Authenticate with Firebase on the client side to get a UID
  const userCred = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCred.user;

  // 2. Offload profile synchronization and billing schema matching to the Node.js server
  await apiClient.syncUserProfile({
    newUid: user.uid,
    email: email,
    displayNameHe,
    displayNameEn,
    role,
    facultyId,
    degreeType: role === 'student' ? 'bachelors' : null,
    yearOfStudy: role === 'student' ? 1 : null,
    major: role === 'student' ? 'computer_science' : null,
    studentId: null
  });

  return user;
};

// ----------------------
// LOGIN
// ----------------------
export const loginUser = async (email: string, password: string) => {
  return await signInWithEmailAndPassword(auth, email, password);
};

// ----------------------
// LOGOUT
// ----------------------
export const logoutUser = async () => {
  await signOut(auth);
};