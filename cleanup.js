const admin = require("firebase-admin");

// Mengambil rahasia dari GitHub Actions
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
const databaseURL = process.env.FIREBASE_DB_URL;

if (!serviceAccountJson || !databaseURL) {
    console.error("❌ ERROR: Rahasia FIREBASE_SERVICE_ACCOUNT atau FIREBASE_DB_URL belum diatur di GitHub Secrets!");
    process.exit(1);
}

// Menyiapkan akses ke Firebase sebagai "Admin"
const serviceAccount = JSON.parse(serviceAccountJson);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: databaseURL
});

const db = admin.database();
const MAX_MESSAGES = 100; // Jumlah pesan maksimal yang disisakan

async function cleanupDatabase() {
    console.log(`🔍 Memeriksa database: ${databaseURL}`);
    try {
        // ==========================================
        // 1. PEMBERSIHAN PESAN
        // ==========================================
        const messagesRef = db.ref("messages");
        const snapshot = await messagesRef.once('value');
        const messages = snapshot.val();

        if (messages) {
            const keys = Object.keys(messages).sort();
            console.log(`📊 Total pesan saat ini: ${keys.length}`);

            if (keys.length > MAX_MESSAGES) {
                const keysToDelete = keys.slice(0, keys.length - MAX_MESSAGES);
                console.log(`🗑️ Menghapus ${keysToDelete.length} pesan lama...`);

                let deletedCount = 0;
                const updates = {};
                for (const key of keysToDelete) {
                    updates[key] = null; // null = hapus di Firebase
                    deletedCount++;
                }
                // Hapus secara massal (lebih cepat & hemat kuota)
                await messagesRef.update(updates);
                console.log(`✅ Berhasil menghapus ${deletedCount} pesan.`);
            } else {
                console.log(`✅ Pesan masih di bawah limit (${MAX_MESSAGES}). Aman.`);
            }
        } else {
            console.log("ℹ️ Tidak ada pesan untuk dibersihkan.");
        }

        // ==========================================
        // 2. PEMBERSIHAN DATA HANTU (TYPING & PRESENCE)
        // ==========================================
        console.log("🧹 Membersihkan 'data hantu' (Typing)...");
        await db.ref("typing").remove(); // Sapu bersih semua status mengetik
        
        console.log("🧹 Membersihkan 'data hantu' (Presence)...");
        const presenceSnap = await db.ref("presence").once('value');
        const presenceData = presenceSnap.val();

        if (presenceData) {
            let inactiveCount = 0;
            const now = Date.now();
            const ONE_DAY_MS = 24 * 60 * 60 * 1000;
            const presenceUpdates = {};

            for (const [uid, info] of Object.entries(presenceData)) {
                // Hapus jika statusnya offline ATAU sudah nyangkut lebih dari 1 hari
                if (info.online === false || (info.lastSeen && (now - info.lastSeen) > ONE_DAY_MS)) {
                    presenceUpdates[uid] = null;
                    inactiveCount++;
                }
            }
            
            if (inactiveCount > 0) {
                await db.ref("presence").update(presenceUpdates);
            }
            console.log(`✅ Berhasil menghapus ${inactiveCount} data pengguna tidak aktif.`);
        }

        console.log(`🎉 SUKSES! Database TChat kini segar kembali!`);
        process.exit(0);

    } catch (error) {
        console.error("❌ Terjadi kesalahan saat menjalankan script:", error);
        process.exit(1);
    }
}

cleanupDatabase();
