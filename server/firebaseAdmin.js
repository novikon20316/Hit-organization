import admin from "firebase-admin";
import fs from "fs";

// ✅ load JSON safely (works in ALL Node versions)
const serviceAccount = JSON.parse(
  fs.readFileSync("./serviceAccountKey.json", "utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const auth = admin.auth();


async function testServer() {
  try {
    await db.collection("serverTest").add({
      status: "server works",
      time: new Date().toISOString()
    });

    console.log("✅ Server Firebase connected");
  } catch (err) {
    console.error("❌ Server Firebase error:", err);
  }
}

testServer();



export { admin, db, auth };