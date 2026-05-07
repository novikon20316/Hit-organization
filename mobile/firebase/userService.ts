import { db } from "./firebaseConfig";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export const createUserProfile = async (user: any, role = "student") => {
  if (!user) return;

  await setDoc(doc(db, "users", user.uid), {
    name: user.displayName || "",
    email: user.email,
    role: role, // 👈 IMPORTANT
    createdAt: serverTimestamp(),
  });
};