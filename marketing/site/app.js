/* CUE-AGENT Promo-Site — Interaktion (vanilla, kein Build)
   - Pricing-Sheet fährt hoch (der eine "spring"-Moment)
   - Install-Befehl kopieren
   - Scroll-Reveal (langsam, atmend; respektiert reduced-motion) */
(function () {
  "use strict";

  // --- Pricing-Sheet ---------------------------------------------------------
  var overlay = document.getElementById("sheet-overlay");
  var sheet = document.getElementById("sheet");
  var openBtn = document.getElementById("open-pricing");
  var closeBtn = document.getElementById("close-pricing");

  function openSheet() {
    overlay.classList.add("open");
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
    closeBtn && closeBtn.focus();
  }
  function closeSheet() {
    overlay.classList.remove("open");
    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
    openBtn && openBtn.focus();
  }
  openBtn && openBtn.addEventListener("click", openSheet);
  closeBtn && closeBtn.addEventListener("click", closeSheet);
  overlay && overlay.addEventListener("click", closeSheet);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && sheet.classList.contains("open")) closeSheet();
  });

  // --- Befehl kopieren -------------------------------------------------------
  document.querySelectorAll(".copy-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-copy") || "";
      var done = function () {
        var old = btn.textContent;
        btn.textContent = "kopiert";
        setTimeout(function () { btn.textContent = old; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, done);
      } else {
        done();
      }
    });
  });

  // --- Scroll-Reveal ---------------------------------------------------------
  var reveals = document.querySelectorAll(".reveal");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  }
})();
