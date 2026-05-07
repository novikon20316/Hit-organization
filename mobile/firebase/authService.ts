import { auth, db } from "../src/firebase/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import { doc, getDoc, setDoc } from "firebase/firestore";

// ----------------------
// SIGN UP (CREATE USER)
// ----------------------
export const registerUser = async (
  email: string,
  password: string,
  role: "student" | "supervisor" | "admin"
) => {
  const userCred = await createUserWithEmailAndPassword(auth, email, password);

  const user = userCred.user;

  // store role in Firestore
  await setDoc(doc(db, "users", user.uid), {
    email,
    role,
    createdAt: Date.now(),
  });

  return user;
};

// ----------------------
// LOGIN + GET ROLE
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