"use strict";

/**
 * Apple Design-System Preset. Sehr clean, viel Weißraum, dezenter Blau-Akzent.
 */
module.exports = {
  name: "apple",
  label: "Apple",
  palette: {
    bg: "#000000",
    surface: "#1D1D1F",
    text: "#F5F5F7",
    textMuted: "#86868B",
    accent: "#2997FF",
    accentHover: "#0077ED",
    gradient: "linear-gradient(135deg, #2997FF 0%, #A0E9FF 100%)",
    border: "#2A2A2C",
  },
  typography: {
    fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
    headingWeight: 600,
    bodyWeight: 400,
    headingSize: "4rem",
    subheadingSize: "1.6rem",
    bodySize: "1.2rem",
    captionSize: "0.9rem",
    lineHeight: 1.4,
  },
  motion: {
    easeIn: "power3.in",
    easeOut: "power3.out",
    easeInOut: "power3.inOut",
    durationFast: 0.4,
    durationMedium: 0.8,
    durationSlow: 1.2,
    stagger: 0.1,
  },
  layout: { maxWidth: "1100px", padding: "96px", borderRadius: "18px" },
};
