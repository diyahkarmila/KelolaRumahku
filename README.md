KelolaRumahKu - Firebase Auth + Firestore Ready

Update terbaru:
- Saat app dibuka, user diarahkan login dulu sebelum bisa masuk dashboard.
- Login dan register sudah terhubung ke Firebase Auth (email/password).
- Saat register berhasil, profil user otomatis disimpan ke Firestore pada users/{uid}.
- Dashboard dan halaman internal diproteksi oleh auth guard.
- Data contoh utama sudah dikosongkan agar siap diisi dari Firebase per user.
- Konfigurasi Firebase sudah disesuaikan dengan project:
  kelolarumahku

File Firebase yang dipakai sekarang:
- js/firebase-config.js  -> config project Firebase
- js/firebase.js         -> inisialisasi app, auth, dan firestore
- js/auth.js             -> login, register, logout, dan proteksi halaman

Cara pakai:
1. Extract ZIP
2. Aktifkan Authentication > Sign-in method > Email/Password di Firebase Console
3. Siapkan Firestore Database
4. Jalankan project lewat local server (mis. Live Server / localhost)
5. Buka pages/login.html atau langsung index.html

Struktur Firestore yang disarankan:
- users/{uid}
- users/{uid}/shopping
- users/{uid}/expenses
- users/{uid}/items
- users/{uid}/activities

Catatan:
- Jangan buka lewat file://, gunakan local server agar module import berjalan normal.
- Semua halaman dashboard akan redirect ke login jika user belum login.
