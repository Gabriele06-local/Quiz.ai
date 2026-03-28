(function (Q) {
  const $ = Q.$;
  const THEME_KEY = "quiz-ai-theme";

  function getTheme() {
    const t = document.documentElement.getAttribute("data-theme");
    return t === "light" ? "light" : "dark";
  }

  function setTheme(mode) {
    const next = mode === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (e) {}
    const btn = $("btn-theme");
    if (btn) {
      btn.setAttribute("aria-label", next === "dark" ? "Passa al tema chiaro" : "Passa al tema scuro");
      btn.setAttribute("title", next === "dark" ? "Tema chiaro (giorno)" : "Tema scuro (notte)");
    }
  }

  Q.initTheme = function initTheme() {
    $("btn-theme")?.addEventListener("click", () => {
      setTheme(getTheme() === "dark" ? "light" : "dark");
    });
    setTheme(getTheme());
  };
})(window.QuizAi);
