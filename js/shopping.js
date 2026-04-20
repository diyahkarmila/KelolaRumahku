import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth, db } from "./firebase.js";
import { guardPage, logoutUser } from "./auth.js";

// ── State ─────────────────────────────────────────────────────────────────────
let currentUid = null;
let unsubscribe = null;
let activeFilter = "all"; // "all" | "done" | "undone"

// ── Helpers ───────────────────────────────────────────────────────────────────
function collectionPath() {
  return `users/${currentUid}/shopping`;
}

function setMessage(text, type = "info") {
  const el = document.getElementById("shoppingMessage");
  if (!el) return;
  el.textContent = text;
  el.className = `form-message ${type}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// ── Render daftar belanja ─────────────────────────────────────────────────────
function renderList(docs) {
  const listEl = document.getElementById("shoppingList");
  const countEl = document.getElementById("shoppingCount");
  if (!listEl) return;

  // Filter sesuai tab aktif
  let filtered = docs;
  if (activeFilter === "done") filtered = docs.filter((d) => d.data().done);
  if (activeFilter === "undone") filtered = docs.filter((d) => !d.data().done);

  // Update counter
  const doneCount = docs.filter((d) => d.data().done).length;
  if (countEl) countEl.textContent = `${doneCount} / ${docs.length} sudah dibeli`;

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="shopping-empty">
      <span>🛒</span>
      <p>${activeFilter === "done" ? "Belum ada item yang dibeli." : activeFilter === "undone" ? "Semua item sudah dibeli! 🎉" : "Daftar belanjamu masih kosong. Tambahkan item di bawah."}</p>
    </div>`;
    return;
  }

  listEl.innerHTML = filtered.map((docSnap) => {
    const d = docSnap.data();
    const id = docSnap.id;
    const done = !!d.done;
    const nama = escapeHtml(d.title || d.nama || "Tanpa nama");
    const jumlah = d.jumlah ? escapeHtml(String(d.jumlah)) : null;
    const kategori = d.category ? escapeHtml(d.category) : null;

    return `
      <div class="shopping-item ${done ? "shopping-item--done" : ""}" data-id="${id}">
        <label class="shopping-check-label" title="${done ? "Tandai belum dibeli" : "Tandai sudah dibeli"}">
          <input
            type="checkbox"
            class="shopping-checkbox"
            data-toggle-id="${id}"
            ${done ? "checked" : ""}
            aria-label="Tandai ${escapeHtml(nama)} sebagai ${done ? "belum" : "sudah"} dibeli"
          />
          <span class="shopping-checkmark"></span>
        </label>
        <div class="shopping-item-body">
          <span class="shopping-item-name">${nama}</span>
          <div class="shopping-item-meta">
            ${jumlah ? `<span class="shopping-badge">× ${jumlah}</span>` : ""}
            ${kategori ? `<span class="shopping-badge shopping-badge--cat">${kategori}</span>` : ""}
            ${done ? `<span class="shopping-badge shopping-badge--done">✓ Sudah dibeli</span>` : ""}
          </div>
        </div>
        <button
          class="shopping-delete-btn"
          data-delete-id="${id}"
          title="Hapus item"
          aria-label="Hapus ${escapeHtml(nama)}"
        >✕</button>
      </div>`;
  }).join("");
}

// ── Subscribe realtime ke Firestore ──────────────────────────────────────────
function subscribeList() {
  if (unsubscribe) unsubscribe();
  const ref = collection(db, collectionPath());
  const q = query(ref, orderBy("createdAt", "desc"));
  unsubscribe = onSnapshot(q, (snapshot) => {
    renderList(snapshot.docs);
    setMessage(``, "info");
  }, () => {
    setMessage("Gagal memuat daftar belanja.", "error");
  });
}

// ── Toggle done/undone ────────────────────────────────────────────────────────
async function toggleItem(id, currentDone) {
  try {
    const ref = doc(db, collectionPath(), id);
    await updateDoc(ref, { done: !currentDone, updatedAt: serverTimestamp() });
  } catch {
    setMessage("Gagal mengubah status item.", "error");
  }
}

// ── Hapus item ────────────────────────────────────────────────────────────────
async function deleteItem(id, btn) {
  btn.disabled = true;
  btn.textContent = "…";
  try {
    await deleteDoc(doc(db, collectionPath(), id));
  } catch {
    setMessage("Gagal menghapus item.", "error");
    btn.disabled = false;
    btn.textContent = "✕";
  }
}

// ── Tambah item baru ──────────────────────────────────────────────────────────
async function addItem(nama, jumlah) {
  const submitBtn = document.getElementById("shoppingSubmitBtn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Menambahkan...";
  try {
    await addDoc(collection(db, collectionPath()), {
      title: nama,
      jumlah: jumlah || null,
      done: false,
      uid: currentUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    document.getElementById("shoppingForm").reset();
    document.getElementById("inputNama").focus();
    setMessage("Item berhasil ditambahkan.", "success");
  } catch {
    setMessage("Gagal menambahkan item.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Tambah";
  }
}

// ── Filter tab ────────────────────────────────────────────────────────────────
function setFilter(filter) {
  activeFilter = filter;
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.classList.toggle("filter-btn--active", btn.dataset.filter === filter);
  });
  // Re-render dengan data yang ada
  const ref = collection(db, collectionPath());
  const q = query(ref, orderBy("createdAt", "desc"));
  getDocs(q).then((snap) => renderList(snap.docs));
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const loginPath = window.location.pathname.includes("/pages/") ? "login.html" : "pages/login.html";
  guardPage(loginPath);

  document.querySelectorAll("[data-logout]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const redirectTo = window.location.pathname.includes("/pages/") ? "login.html" : "pages/login.html";
      await logoutUser(redirectTo);
    });
  });

  // Auth state
  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    currentUid = user.uid;
    subscribeList();
  });

  // Submit form tambah item
  const form = document.getElementById("shoppingForm");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const nama = document.getElementById("inputNama").value.trim();
    const jumlah = document.getElementById("inputJumlah").value.trim();
    if (!nama) {
      setMessage("Nama barang wajib diisi.", "error");
      document.getElementById("inputNama").focus();
      return;
    }
    addItem(nama, jumlah);
  });

  // Delegasi klik pada list: toggle & delete
  document.getElementById("shoppingList")?.addEventListener("change", (e) => {
    const cb = e.target.closest("[data-toggle-id]");
    if (!cb) return;
    const id = cb.dataset.toggleId;
    toggleItem(id, cb.checked === false); // checked sudah berubah sebelum event
  });

  document.getElementById("shoppingList")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-delete-id]");
    if (!btn) return;
    deleteItem(btn.dataset.deleteId, btn);
  });

  // Filter tabs
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => setFilter(btn.dataset.filter));
  });
});
