import { guardPage, logoutUser } from "./auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const loginPath = window.location.pathname.includes("/pages/") ? "login.html" : "pages/login.html";
  guardPage(loginPath);

  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", async () => {
      const redirectTo = window.location.pathname.includes("/pages/") ? "login.html" : "pages/login.html";
      await logoutUser(redirectTo);
    });
  });
});
