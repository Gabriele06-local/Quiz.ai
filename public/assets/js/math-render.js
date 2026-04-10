/**
 * Rendering formule matematiche (KaTeX auto-render su delimitatori $...$, $$...$$, \\(...\\)).
 */
(function (Q) {
  function canRender() {
    return typeof renderMathInElement === "function";
  }

  /**
   * @param {HTMLElement | null} el
   */
  function renderMathIn(el) {
    if (!el || !canRender()) return;
    try {
      renderMathInElement(el, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
          { left: "\\[", right: "\\]", display: true },
        ],
        ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
        trust: false,
        strict: false,
        throwOnError: false,
        errorColor: "var(--danger)",
      });
    } catch (e) {
      console.warn("KaTeX render:", e);
    }
  }

  let raf = 0;
  /** @param {HTMLElement | null} root */
  function scheduleRenderMath(root) {
    if (!root || !canRender()) return;
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = null;
      renderMathIn(root);
    });
  }

  Q.renderMathIn = renderMathIn;
  Q.scheduleRenderMath = scheduleRenderMath;
})(window.QuizAi);
