const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");

initializeApp();

// Hapus pesan yang sudah lewat 7 hari. Jalankan sekali tiap jam.
exports.cleanupExpiredMessages = onSchedule(
  { schedule: "every 60 minutes", timeZone: "Asia/Jakarta", region: "asia-southeast1" },
  async () => {
    const db = getDatabase();
    const snap = await db.ref("messages")
      .orderByChild("expiresAt")
      .endAt(Date.now())
      .once("value");

    const updates = {};
    snap.forEach(child => { updates[child.key] = null; });
    if (Object.keys(updates).length) await db.ref("messages").update(updates);
    console.log(`Cleanup selesai: ${Object.keys(updates).length} pesan dihapus.`);
  }
);
