"use strict";

/**
 * Szenen-Referenzen (@1, @2, …) in Skript/Prompts auflösen.
 *
 * Im Configurator kann man in Narration- oder Prompt-Feldern auf andere
 * Szenen per @N (1-basiert) verweisen. Vor der Produktion werden diese
 * Tokens durch den aussagekräftigen Text der referenzierten Szene ersetzt
 * (Heading/Titel), sodass z. B. ein Bild-Prompt "im Stil von @1" zu
 * "im Stil von <Titel von Szene 1>" wird.
 */

function sceneLabel(scene) {
  if (!scene) return "";
  return scene.heading || scene.title || scene.goal || scene.id || "";
}

/**
 * Ersetzt @N-Tokens im Text durch das Label der referenzierten Szene.
 * @param {string} text
 * @param {Array} scenes  alle Szenen (Reihenfolge = Nummerierung)
 * @returns {string}
 */
function expandRefs(text, scenes) {
  if (!text || typeof text !== "string" || !Array.isArray(scenes)) return text;
  return text.replace(/@(\d+)/g, (match, num) => {
    const idx = parseInt(num, 10) - 1;
    if (idx >= 0 && idx < scenes.length) {
      const label = sceneLabel(scenes[idx]);
      return label || match;
    }
    return match; // ungültiger Index → Token unverändert lassen
  });
}

/**
 * Löst @N-Referenzen in narration und prompt aller Szenen eines Storyboards auf.
 * Mutiert die Szenen in-place und gibt das Storyboard zurück.
 */
function resolveStoryboardRefs(storyboard) {
  if (!storyboard || !Array.isArray(storyboard.scenes)) return storyboard;
  const scenes = storyboard.scenes;
  for (const s of scenes) {
    if (s.narration) s.narration = expandRefs(s.narration, scenes);
    if (s.prompt) s.prompt = expandRefs(s.prompt, scenes);
  }
  return storyboard;
}

module.exports = { expandRefs, resolveStoryboardRefs, sceneLabel };
