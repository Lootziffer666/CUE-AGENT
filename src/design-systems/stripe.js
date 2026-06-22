"use strict";

/**
 * Stripe Design-System Preset. Hell, vertrauenswürdig, lila Akzent.
 */
module.exports = {
  name: "stripe",
  label: "Stripe",
  palette: {
    bg: "#0A2540",
    surface: "#0E2E4E",
    text: "#FFFFFF",
    textMuted: "#ADBDCC",
    accent: "#635BFF",
    accentHover: "#534ADF",
    gradient: "linear-gradient(135deg, #635BFF 0%, #00D4FF 100%)",
    border: "#1B3A5B",
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    headingWeight: 700,
    bodyWeight: 400,
    headingSize: "3.5rem",
    subheadingSize: "1.5rem",
    bodySize: "1.125rem",
    captionSize: "0.875rem",
    lineHeight: 1.5,
  },
  motion: {
    easeIn: "power2.in",
    easeOut: "power2.out",
    easeInOut: "power2.inOut",
    durationFast: 0.3,
    durationMedium: 0.6,
    durationSlow: 1.0,
    stagger: 0.08,
  },
  layout: { maxWidth: "1200px", padding: "80px", borderRadius: "12px" },
};
