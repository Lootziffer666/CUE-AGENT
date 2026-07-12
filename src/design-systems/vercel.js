"use strict";

/**
 * Vercel Design-System Preset.
 *
 * Definiert Palette, Typografie und Motion-Tokens für Szenen-Generierung.
 */

module.exports = {
  name: "vercel",
  label: "Vercel",
  palette: {
    bg: "#000000",
    surface: "#111111",
    text: "#EDEDED",
    textMuted: "#888888",
    accent: "#0070F3",
    accentHover: "#0060D6",
    gradient: "linear-gradient(135deg, #0070F3 0%, #7928CA 100%)",
    border: "#333333",
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
  layout: {
    maxWidth: "1200px",
    padding: "80px",
    borderRadius: "12px",
  },
};
