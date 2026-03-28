window.QuizAi = window.QuizAi || {};
(function (Q) {
  function $(id) {
    return document.getElementById(id);
  }
  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML.replace(/\n/g, "<br/>");
  }
  Q.$ = $;
  Q.escapeHtml = escapeHtml;
})(window.QuizAi);
