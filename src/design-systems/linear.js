"use strict";

/**
 * Linear Design-System Preset.
 *
 * Klar, technisch, mit violettem Akzent — für SaaS/Dev-Tools.
 */

module.exports = {
  name: "linear",
  label: "Linear",
  palette: {
    bg: "#08090A",
    surface: "#141516",
    text: "#F7F8F8",
    textMuted: "#8A8F98",
    accent: "#5E6AD2",
    accentHover: "#4C56B8",
    gradient: "linear-gradient(135deg, #5E6AD2 0%, #8B5CF6 100%)",
    border: "#23252A",
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    headingWeight: 600,
    bodyWeight: 400,
    headingSize: "3.4rem",
    subheadingSize: "1.4rem",
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
  layout: {
    maxWidth: "1100px",
    padding: "72px",
    borderRadius: "10px",
  },
};
