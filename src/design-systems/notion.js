"use strict";

/**
 * Notion Design-System Preset. Hell, warm, freundlich, schwarz-weiß mit Wärme.
 */
module.exports = {
  name: "notion",
  label: "Notion",
  palette: {
    bg: "#FFFFFF",
    surface: "#F7F6F3",
    text: "#37352F",
    textMuted: "#9B9A97",
    accent: "#2383E2",
    accentHover: "#0B6BCB",
    gradient: "linear-gradient(135deg, #2383E2 0%, #2EAADC 100%)",
    border: "#E9E9E7",
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    headingWeight: 700,
    bodyWeight: 400,
    headingSize: "3.4rem",
    subheadingSize: "1.45rem",
    bodySize: "1.125rem",
    captionSize: "0.875rem",
    lineHeight: 1.5,
  },
  motion: {
    easeIn: "power2.in",
    easeOut: "power2.out",
    easeInOut: "power2.inOut",
    durationFast: 0.3,
    durationMedium: 0.55,
    durationSlow: 0.9,
    stagger: 0.07,
  },
  layout: { maxWidth: "1150px", padding: "80px", borderRadius: "8px" },
};
