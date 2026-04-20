import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase.js";

function setMessage(el, message, type = "info") {
  if (!el) return;
  el.textContent = message;
  el.className = `form-message ${type}`;
}

export function redirectIfLoggedIn(target = "../index.html") {
  onAuthStateChanged(auth, (user) => {
    if (user?.emailVerified) window.location.href = target;
  });
}

export function guardPage(loginPath = "pages/login.html") {
  const loadingEl = document.getElementById("authGateMessage");
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = loginPath;
      return;
    }

    if (!user.emailVerified) {
      window.location.href = `${loginPath}?verify=pending`;
      return;
    }

    if (loadingEl) loadingEl.style.display = "none";
    document.body.classList.add("app-ready");
    hydrateUserUI(user);
  });
}

export async function loginWithEmail({ email, password, messageEl, redirectTo = "../index.html" }) {
  try {
    setMessage(messageEl, "Sedang masuk...", "info");
    const credential = await signInWithEmailAndPassword(auth, email, password);

    if (!credential.user.emailVerified) {
      setMessage(messageEl, "Email belum diverifikasi. Cek inbox kamu lalu klik link verifikasi, atau kirim ulang email verifikasi di bawah.", "error");
      document.dispatchEvent(new CustomEvent("auth:verification-required", {
        detail: { email: credential.user.email || email }
      }));
      return;
    }

    window.location.href = redirectTo;
  } catch (error) {
    setMessage(messageEl, mapAuthError(error.code), "error");
  }
}

export async function registerWithEmail({ name, email, password, confirmPassword, messageEl, redirectTo = "login.html?verify=sent" }) {
  if (password !== confirmPassword) {
    setMessage(messageEl, "Konfirmasi password belum sama.", "error");
    return;
  }

  if (password.length < 6) {
    setMessage(messageEl, "Password minimal 6 karakter.", "error");
    return;
  }

  try {
    setMessage(messageEl, "Sedang membuat akun...", "info");
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    if (name?.trim()) {
      await updateProfile(credential.user, { displayName: name.trim() });
    }

    await setDoc(doc(db, "users", credential.user.uid), {
      uid: credential.user.uid,
      name: name?.trim() || "Pengguna KelolaRumahKu",
      email: credential.user.email,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    await sendEmailVerification(credential.user);
    await signOut(auth);
    window.location.href = redirectTo;
  } catch (error) {
    setMessage(messageEl, mapAuthError(error.code), "error");
  }
}

export async function logoutUser(redirectTo = "pages/login.html") {
  await signOut(auth);
  window.location.href = redirectTo;
}

export async function loadUserProfile() {
  const user = auth.currentUser;
  if (!user) return null;

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export function hydrateUserUI(user) {
  const nameEls = document.querySelectorAll("[data-user-name]");
  const emailEls = document.querySelectorAll("[data-user-email]");
  const initialEls = document.querySelectorAll("[data-user-initial]");
  const name = user.displayName || user.email?.split("@")[0] || "Pengguna";
  const initial = name.charAt(0).toUpperCase();

  nameEls.forEach((el) => { el.textContent = name; });
  emailEls.forEach((el) => { el.textContent = user.email || ""; });
  initialEls.forEach((el) => { el.textContent = initial; });
}

function mapAuthError(code) {
  const messages = {
    "auth/email-already-in-use": "Email ini sudah terdaftar.",
    "auth/invalid-email": "Format email belum benar.",
    "auth/invalid-credential": "Email atau password tidak sesuai.",
    "auth/missing-password": "Password wajib diisi.",
    "auth/weak-password": "Password terlalu lemah.",
    "auth/too-many-requests": "Terlalu banyak percobaan. Coba lagi sebentar.",
  };
  return messages[code] || "Terjadi kendala. Coba lagi.";
}


export async function resendCurrentUserVerificationEmail(messageEl) {
  try {
    if (!auth.currentUser) {
      setMessage(messageEl, "Belum ada sesi login untuk mengirim ulang verifikasi.", "error");
      return;
    }
    await sendEmailVerification(auth.currentUser);
    setMessage(messageEl, "Email verifikasi berhasil dikirim ulang. Silakan cek inbox atau folder spam.", "success");
  } catch (error) {
    setMessage(messageEl, mapAuthError(error.code), "error");
  }
}
