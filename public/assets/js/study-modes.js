(function (Q) {
  /**
   * @param {string} s
   */
  function normalizeAnswer(s) {
    return String(s || "")
      .normalize("NFC")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/['\u2019′`]/g, "'");
  }

  /**
   * Confronto tollerante per completamento aperto.
   * @param {string} userInput
   * @param {string} correctText
   */
  function openAnswersMatch(userInput, correctText) {
    const u = normalizeAnswer(userInput);
    const c = normalizeAnswer(correctText);
    if (!u || !c) return false;
    if (u === c) return true;
    if (c.length >= 4 && u.includes(c)) return true;
    if (u.length >= c.length * 0.6 && c.includes(u)) return true;
    return false;
  }

  /**
   * Prova a sostituire una parola della risposta corretta nel testo con segnaposto.
   * @param {string} stem
   * @param {string} correctText
   * @returns {string | null}
   */
  function tryStemBlank(stem, correctText) {
    const plain = correctText.replace(/\s+/g, " ").trim();
    if (plain.length < 2) return null;
    const words = plain.split(/\s+/).filter((w) => w.length > 2);
    const lowerStem = stem.toLowerCase();
    for (const w of words) {
      const lw = w.toLowerCase();
      const pos = lowerStem.indexOf(lw);
      if (pos >= 0) {
        return stem.slice(0, pos) + "_____" + stem.slice(pos + w.length);
      }
    }
    return null;
  }

  /**
   * @template T
   * @param {T[]} arr
   * @returns {T[]}
   */
  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  Q.StudyModeUtils = {
    normalizeAnswer,
    openAnswersMatch,
    tryStemBlank,
    shuffleArray,
  };
})(window.QuizAi);
