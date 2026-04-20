import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth, db } from "./firebase.js";
import { loadUserProfile } from "./auth.js";

const amountKeys = ["amount", "nominal", "total", "harga", "price", "value", "jumlah"];
const titleKeys = ["title", "name", "nama", "item", "keterangan", "description", "judul"];
const categoryKeys = ["category", "kategori", "type", "jenis"];
const dateKeys = ["date", "tanggal", "createdAt", "updatedAt", "timestamp"];

function formatCurrency(value = 0) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d,-]/g, "").replace(/\./g, "").replace(",", ".");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function extractAmount(data = {}) {
  for (const key of amountKeys) {
    if (key in data) return toNumber(data[key]);
  }
  return 0;
}

function extractTitle(data = {}, fallback = "Tanpa Judul") {
  for (const key of titleKeys) {
    if (data[key]) return String(data[key]);
  }
  return fallback;
}

function extractCategory(data = {}, fallback = "Umum") {
  for (const key of categoryKeys) {
    if (data[key]) return String(data[key]);
  }
  return fallback;
}

function extractDate(data = {}) {
  for (const key of dateKeys) {
    const value = data[key];
    if (!value) continue;
    if (typeof value?.toDate === "function") return value.toDate();
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}


let monthlyFinanceChart;

function destroyChart(instance) {
  if (instance && typeof instance.destroy === "function") instance.destroy();
}

const lineShadowPlugin = {
  id: "lineShadowPlugin",
  beforeDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.shadowColor = "rgba(109, 135, 81, 0.18)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 6;
  },
  afterDatasetsDraw(chart) {
    chart.ctx.restore();
  },
};

function getLastSixMonthsLabels() {
  const now = new Date();
  const labels = [];
  for (let i = 5; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(new Intl.DateTimeFormat("id-ID", { month: "short" }).format(date));
  }
  return labels;
}

function buildMonthlySeries(records = []) {
  const now = new Date();
  const totals = Array(6).fill(0);
  records.forEach((item) => {
    const date = extractDate(item);
    if (!date) return;
    const diff = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
    if (diff >= 0 && diff < 6) {
      totals[5 - diff] += extractAmount(item);
    }
  });
  return totals;
}

function renderCharts({ monthlyIncome, monthlyExpense, balance, incomes, expenses }) {
  if (typeof Chart === "undefined") return;

  const labels = getLastSixMonthsLabels();
  const incomeSeries = buildMonthlySeries(incomes);
  const expenseSeries = buildMonthlySeries(expenses);

  destroyChart(monthlyFinanceChart);

  const monthlyCtx = document.getElementById("monthlyFinanceChart");

  if (monthlyCtx) {
    monthlyFinanceChart = new Chart(monthlyCtx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Pemasukan",
            data: incomeSeries,
            borderColor: "#7ca057",
            backgroundColor: "rgba(124, 160, 87, 0.12)",
            fill: true,
            tension: 0.38,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: "#7ca057",
            pointBorderWidth: 0,
            borderWidth: 3,
          },
          {
            label: "Pengeluaran",
            data: expenseSeries,
            borderColor: "#c8b07c",
            backgroundColor: "rgba(200, 176, 124, 0.10)",
            fill: true,
            tension: 0.38,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: "#c8b07c",
            pointBorderWidth: 0,
            borderWidth: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "top" } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (value) => `Rp ${Number(value).toLocaleString("id-ID")}` },
            grid: { color: "rgba(124, 160, 87, 0.08)" },
          },
          x: { grid: { display: false } },
        },
      },
      plugins: [lineShadowPlugin],
    });
  }
}

function formatShortDate(date) {
  if (!date) return "Tanpa tanggal";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

async function safeGetCollectionDocs(path, options = {}) {
  try {
    const ref = collection(db, path);
    const queryParts = [];
    if (options.orderByField) queryParts.push(orderBy(options.orderByField, options.orderDirection || "desc"));
    if (options.limitCount) queryParts.push(limit(options.limitCount));
    const collectionQuery = queryParts.length ? query(ref, ...queryParts) : ref;
    const snapshot = await getDocs(collectionQuery);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    return [];
  }
}

function isCurrentMonth(date) {
  if (!date) return false;
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

function renderRecentList(containerId, items, type = "expense") {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `<div class="empty-inline">Belum ada data ${type === "expense" ? "pengeluaran" : "aktivitas"}.</div>`;
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const icon = type === "expense" ? "💸" : "📝";
      const subtitle = type === "expense"
        ? `${extractCategory(item)} • ${formatShortDate(extractDate(item))}`
        : formatShortDate(extractDate(item));
      const value = type === "expense" ? formatCurrency(extractAmount(item)) : (item.status || item.note || item.deskripsi || "Aktivitas tercatat");

      return `
        <div class="item modern-item">
          <div class="item-left">
            <div class="item-badge bg-mint">${icon}</div>
            <div>
              <h4>${extractTitle(item, type === "expense" ? "Pengeluaran" : "Aktivitas")}</h4>
              <p>${subtitle}</p>
            </div>
          </div>
          <strong>${value}</strong>
        </div>
      `;
    })
    .join("");
}

function updateFinancialSummary({ totalExpense, totalIncome, monthlyExpense, monthlyIncome, itemCount, activityCount, shoppingCount, expenseCount, incomeCount }) {
  const balance = totalIncome - totalExpense;
  setText("totalBelanja", `${shoppingCount} Item`);
  setText("totalPengeluaran", formatCurrency(totalExpense));
  setText("totalPemasukan", formatCurrency(totalIncome));
  setText("totalAktivitas", `${activityCount} Aktivitas`);
  setText("totalPeralatan", `${itemCount} Barang`);

  setText("monthlyIncome", formatCurrency(monthlyIncome));
  setText("monthlyExpense", formatCurrency(monthlyExpense));
  setText("netBalance", formatCurrency(balance));

  const statusEl = document.getElementById("financialStatus");
  const noteEl = document.getElementById("netBalanceNote");
  if (statusEl) {
    if (monthlyIncome === 0 && monthlyExpense === 0) {
      statusEl.textContent = "Belum ada data";
    } else if (monthlyIncome >= monthlyExpense) {
      statusEl.textContent = "Keuangan aman";
    } else {
      statusEl.textContent = "Pengeluaran tinggi";
    }
  }

  if (noteEl) {
    if (balance > 0) noteEl.textContent = "Kondisi keuangan surplus dari total catatan";
    else if (balance < 0) noteEl.textContent = "Pengeluaran lebih besar dari pemasukan";
    else noteEl.textContent = "Pemasukan dan pengeluaran masih seimbang";
  }
}

async function renderProfileSummary() {
  const profile = await loadUserProfile();
  const welcome = document.getElementById("welcomeText");
  if (!welcome) return;

  const fallbackName = auth.currentUser?.displayName || auth.currentUser?.email?.split("@")[0] || "Kamu";
  const name = profile?.name || fallbackName;
  welcome.textContent = `Halo, ${name}. Pantau ringkasan rumah, pemasukan, dan pengeluaranmu dalam satu tampilan yang lebih modern.`;
}

async function loadDashboardData() {
  const user = auth.currentUser;
  if (!user) return;

  const basePath = `users/${user.uid}`;
  const [shopping, expenses, items, activities, incomePrimary, incomeAlt] = await Promise.all([
    safeGetCollectionDocs(`${basePath}/shopping`),
    safeGetCollectionDocs(`${basePath}/expenses`),
    safeGetCollectionDocs(`${basePath}/items`),
    safeGetCollectionDocs(`${basePath}/activities`),
    safeGetCollectionDocs(`${basePath}/income`),
    safeGetCollectionDocs(`${basePath}/pemasukan`),
  ]);

  const incomes = [...incomePrimary, ...incomeAlt];

  const totalExpense = expenses.reduce((sum, item) => sum + extractAmount(item), 0);
  const totalIncome = incomes.reduce((sum, item) => sum + extractAmount(item), 0);
  const monthlyExpense = expenses.reduce((sum, item) => {
    const date = extractDate(item);
    return sum + (isCurrentMonth(date) ? extractAmount(item) : 0);
  }, 0);
  const monthlyIncome = incomes.reduce((sum, item) => {
    const date = extractDate(item);
    return sum + (isCurrentMonth(date) ? extractAmount(item) : 0);
  }, 0);

  updateFinancialSummary({
    totalExpense,
    totalIncome,
    monthlyExpense,
    monthlyIncome,
    itemCount: items.length,
    activityCount: activities.length,
    shoppingCount: shopping.length,
    expenseCount: expenses.length,
    incomeCount: incomes.length,
  });

  renderCharts({
    monthlyIncome,
    monthlyExpense,
    balance: totalIncome - totalExpense,
    incomes,
    expenses,
  });

  const recentExpenses = [...expenses]
    .sort((a, b) => (extractDate(b)?.getTime() || 0) - (extractDate(a)?.getTime() || 0))
    .slice(0, 5);
  renderRecentList("recentExpensesList", recentExpenses, "expense");
}

// Tunggu Firebase Auth selesai restore sesi sebelum load data
// (DOMContentLoaded saja tidak cukup karena auth.currentUser masih null saat itu)
onAuthStateChanged(auth, async (user) => {
  if (!user || !user.emailVerified) return;
  await renderProfileSummary();
  await loadDashboardData();
});
