
document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll("[data-demo]");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      alert("Ini versi UI estetik. Fitur backend/Firebase bisa dihubungkan pada tahap implementasi.");
    });
  });
});
