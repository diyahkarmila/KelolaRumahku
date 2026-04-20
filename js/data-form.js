import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth, db } from "./firebase.js";
import { guardPage, logoutUser } from "./auth.js";

const hiddenKeys = new Set(["createdAt", "updatedAt", "uid"]);

// ── State untuk mode Edit ────────────────────────────────────────────────────
let editingId = null;

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function titleFromKey(key) {
  const map = {
    title: "Nama",
    amount: "Nominal",
    jumlah: "Jumlah",
    category: "Kategori",
    date: "Tanggal",
    notes: "Catatan",
    paymentMethod: "Metode pembayaran",
    condition: "Kondisi",
    location: "Lokasi",
    type: "Jenis",
    value: "Nilai",
    color: "Warna",
    icon: "Ikon",
    status: "Status",
    description: "Deskripsi",
    time: "Waktu",
    priority: "Prioritas",
  };
  return map[key] || key;
}

function formatValue(key, value) {
  if (value == null || value === "") return "-";
  if (typeof value === "number" && ["amount", "value"].includes(key)) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
  }
  if (typeof value?.toDate === "function") {
    return value.toDate().toLocaleString("id-ID");
  }
  return String(value);
}

function setMessage(el, text, type = "info") {
  if (!el) return;
  el.textContent = text;
  el.className = `form-message ${type}`;
}

function getCollectionPath(uid, collectionName) {
  return `users/${uid}/${collectionName}`;
}

async function loadEntries({ uid, collectionName, listEl, messageEl, singular }) {
  if (!listEl) return;
  try {
    setMessage(messageEl, `Memuat data ${singular}...`, "info");
    const ref = collection(db, getCollectionPath(uid, collectionName));
    const q = query(ref, orderBy("createdAt", "desc"), limit(50));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      listEl.innerHTML = `<div class="empty-list">Belum ada data ${escapeHtml(singular)}. Tambahkan data pertama melalui form di bawah.</div>`;
      setMessage(messageEl, `Belum ada data ${singular}.`, "info");
      return;
    }

    const cards = snapshot.docs.map((item) => {
      const data = item.data();
      const title = data.title || data.name || `${singular} baru`;
      const rows = Object.entries(data)
        .filter(([key]) => !hiddenKeys.has(key))
        .slice(0, 8)
        .map(([key, value]) => `
          <div class="entry-meta-item">
            <small>${escapeHtml(titleFromKey(key))}</small>
            <strong>${escapeHtml(formatValue(key, value))}</strong>
          </div>`)
        .join("");

      return `
        <article class="entry-card">
          <div class="entry-card-head">
            <h4>${escapeHtml(title)}</h4>
            <div class="entry-card-actions">
              <button class="btn btn-edit" type="button" data-edit-id="${item.id}">✏️ Edit</button>
              <button class="btn btn-danger" type="button" data-delete-id="${item.id}">Hapus</button>
            </div>
          </div>
          <div class="entry-meta">${rows}</div>
        </article>`;
    }).join("");

    listEl.innerHTML = cards;
    setMessage(messageEl, `Menampilkan ${snapshot.docs.length} data ${singular} terbaru.`, "success");
  } catch (error) {
    console.error(error);
    listEl.innerHTML = `<div class="empty-list">Gagal memuat data ${escapeHtml(singular)}.</div>`;
    setMessage(messageEl, `Gagal memuat data ${singular}. Pastikan index Firestore aktif dan user sudah login.`, "error");
  }
}

function normalizeValue(input) {
  const { name, type, value } = input;
  if (type === "number") return Number(value || 0);
  if (type === "date") return value || null;
  if (type === "time") return value || null;
  return value.trim();
}

// ── Masuk mode Edit: isi form dengan data item yang dipilih ─────────────────
function enterEditMode({ form, submitBtn, cancelBtn, titleEl, itemId, data }) {
  editingId = itemId;

  // Isi setiap input form dengan data yang ada
  form.querySelectorAll("input[name]").forEach((input) => {
    const val = data[input.name];
    if (val == null) return;
    // Konversi Firestore Timestamp ke string tanggal
    if (typeof val?.toDate === "function") {
      if (input.type === "date") {
        input.value = val.toDate().toISOString().slice(0, 10);
      } else {
        input.value = val.toDate().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
      }
    } else {
      input.value = val;
    }
  });

  submitBtn.textContent = "Update Data";
  submitBtn.classList.add("btn-warning");
  submitBtn.classList.remove("btn-primary");
  if (cancelBtn) cancelBtn.style.display = "inline-flex";
  if (titleEl) titleEl.textContent = "Edit data";

  // Scroll ke form
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Keluar dari mode Edit: reset form ke keadaan awal ───────────────────────
function exitEditMode({ form, submitBtn, cancelBtn, titleEl }) {
  editingId = null;
  form.reset();
  submitBtn.textContent = "Simpan Data";
  submitBtn.classList.remove("btn-warning");
  submitBtn.classList.add("btn-primary");
  if (cancelBtn) cancelBtn.style.display = "none";
  if (titleEl) titleEl.textContent = titleEl.dataset.originalTitle || "Tambah data";
}

document.addEventListener("DOMContentLoaded", () => {
  const loginPath = window.location.pathname.includes("/pages/") ? "login.html" : "pages/login.html";
  guardPage(loginPath);

  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", async () => {
      const redirectTo = window.location.pathname.includes("/pages/") ? "login.html" : "pages/login.html";
      await logoutUser(redirectTo);
    });
  });

  const form = document.querySelector(".data-form");
  const listEl = document.querySelector("[data-entries-list]");
  const messageEl = document.querySelector("[data-form-message]");
  if (!form) return;

  const collectionName = form.dataset.collection;
  const singular = form.dataset.singular || "data";

  const submitBtn = form.querySelector('button[type="submit"]');

  // Tombol Batal Edit — dibuat secara dinamis
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn-soft";
  cancelBtn.textContent = "Batal Edit";
  cancelBtn.style.display = "none";
  submitBtn.insertAdjacentElement("afterend", cancelBtn);

  // Simpan judul form asli
  const formTitleEl = document.getElementById("formPanelTitle");
  if (formTitleEl) formTitleEl.dataset.originalTitle = formTitleEl.textContent;

  cancelBtn.addEventListener("click", () => {
    exitEditMode({ form, submitBtn, cancelBtn, titleEl: formTitleEl });
  });

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    await loadEntries({ uid: user.uid, collectionName, listEl, messageEl, singular });
  });

  // ── Submit: Add atau Update ─────────────────────────────────────────────────
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      setMessage(messageEl, "Sesi login tidak ditemukan. Silakan login ulang.", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = editingId ? "Mengupdate..." : "Menyimpan...";

    try {
      const payload = {};
      form.querySelectorAll("input[name]").forEach((input) => {
        payload[input.name] = normalizeValue(input);
      });
      if (!payload.title && payload.name) payload.title = payload.name;
      payload.uid = user.uid;
      payload.updatedAt = serverTimestamp();

      if (editingId) {
        // ── Mode Edit: Update dokumen yang ada ────────────────────────────
        const docRef = doc(db, getCollectionPath(user.uid, collectionName), editingId);
        await updateDoc(docRef, payload);
        setMessage(messageEl, `Data ${singular} berhasil diperbarui.`, "success");
        exitEditMode({ form, submitBtn, cancelBtn, titleEl: formTitleEl });
      } else {
        // ── Mode Tambah: Buat dokumen baru ────────────────────────────────
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, getCollectionPath(user.uid, collectionName)), payload);
        form.reset();
        setMessage(messageEl, `Data ${singular} berhasil disimpan.`, "success");
      }

      await loadEntries({ uid: user.uid, collectionName, listEl, messageEl, singular });
    } catch (error) {
      console.error(error);
      setMessage(messageEl, `Gagal menyimpan data ${singular}. Periksa konfigurasi Firestore dan rules.`, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = editingId ? "Update Data" : "Simpan Data";
    }
  });

  // ── Klik pada list: Edit atau Delete ────────────────────────────────────────
  listEl?.addEventListener("click", async (event) => {
    const user = auth.currentUser;
    if (!user) return;

    // Tombol Hapus
    const deleteBtn = event.target.closest("[data-delete-id]");
    if (deleteBtn) {
      // Jika sedang edit item ini, batalkan dulu
      if (editingId === deleteBtn.dataset.deleteId) {
        exitEditMode({ form, submitBtn, cancelBtn, titleEl: formTitleEl });
      }
      deleteBtn.disabled = true;
      deleteBtn.textContent = "Menghapus...";
      try {
        await deleteDoc(doc(db, getCollectionPath(user.uid, collectionName), deleteBtn.dataset.deleteId));
        setMessage(messageEl, `Data ${singular} berhasil dihapus.`, "success");
        await loadEntries({ uid: user.uid, collectionName, listEl, messageEl, singular });
      } catch (error) {
        console.error(error);
        setMessage(messageEl, `Gagal menghapus data ${singular}.`, "error");
        deleteBtn.disabled = false;
        deleteBtn.textContent = "Hapus";
      }
      return;
    }

    // Tombol Edit
    const editBtn = event.target.closest("[data-edit-id]");
    if (editBtn) {
      const itemId = editBtn.dataset.editId;
      try {
        const docRef = doc(db, getCollectionPath(user.uid, collectionName), itemId);
        const snap = await getDoc(docRef);
        if (!snap.exists()) {
          setMessage(messageEl, "Data tidak ditemukan.", "error");
          return;
        }
        enterEditMode({ form, submitBtn, cancelBtn, titleEl: formTitleEl, itemId, data: snap.data() });
      } catch (error) {
        console.error(error);
        setMessage(messageEl, "Gagal memuat data untuk diedit.", "error");
      }
    }
  });
});
