"use strict";

/**
 * Horror Design-System Preset.
 *
 * Dunkel, dringlich, mit blutrotem Akzent — für HORRORGETICON OPS &
 * Event-/Krisen-Kontexte. Seriös, aber mit unterschwelliger Bedrohung.
 */

module.exports = {
  name: "horror",
  label: "Horror Ops",
  palette: {
    bg: "#0A0A0B",
    surface: "#16131A",
    text: "#F2E9E4",
    textMuted: "#8A7F86",
    accent: "#C1121F",
    accentHover: "#9D0208",
    gradient: "linear-gradient(135deg, #C1121F 0%, #6A040F 100%)",
    border: "#2A1E26",
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    headingWeight: 800,
    bodyWeight: 400,
    headingSize: "3.6rem",
    subheadingSize: "1.5rem",
    bodySize: "1.2rem",
    captionSize: "0.875rem",
    lineHeight: 1.45,
  },
  motion: {
    easeIn: "power3.in",
    easeOut: "power3.out",
    easeInOut: "power2.inOut",
    durationFast: 0.35,
    durationMedium: 0.7,
    durationSlow: 1.1,
    stagger: 0.1,
  },
  layout: {
    maxWidth: "1200px",
    padding: "80px",
    borderRadius: "10px",
  },
};
