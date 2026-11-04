/**
 * Reusable Navbar Controller for HOFIS Website
 */
window.openNavModal = function(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "flex";
};

window.closeNavModal = function(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "none";
};

document.addEventListener("DOMContentLoaded", () => {
  // Close modals when clicking backdrop
  window.addEventListener("click", (e) => {
    if (e.target.classList.contains("navbar-modal-backdrop")) {
      e.target.style.display = "none";
    }
  });

  // Close modals on Escape key
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".navbar-modal-backdrop").forEach((m) => {
        m.style.display = "none";
      });
    }
  });
});

