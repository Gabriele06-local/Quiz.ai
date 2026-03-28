(function () {
  "use strict";

  const PROGRESS_KEY = "quiz-ai-progress";
  const HISTORY_KEY = "quiz-ai-history";
  const STORAGE_VERSION = 2;

  function stripMd(s) {
    return s.replace(/\*\*/g, "").replace(/\*/g, "").trim();
  }

  function isHorizontalRule(line) {
    return /^[-*_]{3,}\s*$/.test(line.trim());
  }

  function tryParseQuestionHeader(trimmed) {
    if (!trimmed || isHorizontalRule(trimmed)) return null;
    let t = trimmed.replace(/^#{1,6}\s+/, "").trim();
    while (t.length > 4 && t.startsWith("**") && t.endsWith("**")) {
      t = t.slice(2, -2).trim();
    }
    const m = t.match(/^(\d+)[\.\)]\s*(.+)$/);
    return m ? { num: m[1], rest: m[2] } : null;
  }

  function isNewQuestionLine(trimmed) {
    return tryParseQuestionHeader(trimmed) !== null;
  }

  /**
   * @param {string} raw
   * @returns {{ stem: string, options: Record<string, string>, correct: string, hint: string, sourceIndex: number }[]}
   */
  function parseQuizText(raw) {
    const lines = raw.split(/\r?\n/).map((l) => l.replace(/\s+$/, ""));
    const questions = [];
    let sourceIndex = 0;

    let i = 0;
    while (i < lines.length) {
      const trimmed = lines[i].trim();
      const hdr = tryParseQuestionHeader(trimmed);

      if (!hdr) {
        i += 1;
        continue;
      }

      sourceIndex += 1;
      let stem = stripMd(hdr.rest);
      i += 1;

      while (i < lines.length) {
        const T = lines[i].trim();
        if (isHorizontalRule(T)) {
          i += 1;
          continue;
        }
        if (/^([A-Da-d])[\)\.\:]\s/.test(T)) break;
        if (/^✅?\s*\**Risposta/i.test(T)) break;
        if (/^(?:💡\s*)?(?:Suggerimento|Hint)\s*:/i.test(T)) break;
        if (isNewQuestionLine(T)) break;
        if (T) stem += `\n${stripMd(T)}`;
        i += 1;
      }

      /** @type {Record<string, string>} */
      const options = { A: "", B: "", C: "", D: "" };

      while (i < lines.length) {
        const T = lines[i].trim();
        if (isHorizontalRule(T)) {
          i += 1;
          continue;
        }
        const optMatch = T.match(/^([A-Da-d])[\)\.\:]\s*(.*)$/);
        if (!optMatch) break;
        const key = optMatch[1].toUpperCase();
        let body = stripMd(optMatch[2]);
        i += 1;
        while (i < lines.length) {
          const nt = lines[i].trim();
          if (isHorizontalRule(nt)) {
            i += 1;
            continue;
          }
          if (/^([A-Da-d])[\)\.\:]\s/.test(nt)) break;
          if (/^✅?\s*\**Risposta/i.test(nt)) break;
          if (/^(?:💡\s*)?(?:Suggerimento|Hint)\s*:/i.test(nt)) break;
          if (isNewQuestionLine(nt)) break;
          if (nt) body += `\n${stripMd(nt)}`;
          i += 1;
        }
        if (key in options) options[key] = body.trim();
      }

      let correct = "";
      if (i < lines.length) {
        const T = stripMd(lines[i]);
        const ansMatch = T.match(/Risposta\s*(corretta)?\s*:\s*([A-Da-d])\b/i);
        if (ansMatch) correct = ansMatch[2].toUpperCase();
        i += 1;
      }

      let hint = "";
      while (i < lines.length) {
        const T = lines[i].trim();
        if (isHorizontalRule(T)) {
          i += 1;
          continue;
        }
        if (isNewQuestionLine(T)) break;
        const hintMatch = T.match(/^(?:💡\s*)?(?:Suggerimento|Hint)\s*:\s*(.*)$/i);
        if (hintMatch) {
          hint = stripMd(hintMatch[1] || "");
          i += 1;
          while (i < lines.length) {
            const nt = lines[i].trim();
            if (!nt) break;
            if (isHorizontalRule(nt)) break;
            if (isNewQuestionLine(nt)) break;
            if (/^([A-Da-d])[\)\.\:]\s/.test(nt)) break;
            if (/^✅?\s*\**Risposta/i.test(nt)) break;
            hint += `\n${stripMd(nt)}`;
            i += 1;
          }
          break;
        }
        if (!T) {
          i += 1;
          continue;
        }
        if (/^✅?\s*$/.test(T)) {
          i += 1;
          continue;
        }
        break;
      }

      const stemOk = stem.trim().length > 0;
      const keys = ["A", "B", "C", "D"];
      const allOpts = keys.every((k) => options[k].length > 0);
      if (stemOk && allOpts && correct && keys.includes(correct)) {
        questions.push({
          stem: stem.trim(),
          options,
          correct,
          hint: hint.trim(),
          sourceIndex,
        });
      }
    }

    return questions;
  }

  const $ = (id) => document.getElementById(id);

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML.replace(/\n/g, "<br/>");
  }

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

  $("btn-theme")?.addEventListener("click", () => {
    setTheme(getTheme() === "dark" ? "light" : "dark");
  });

  setTheme(getTheme());

  const SAMPLE = `1. Qual è la differenza principale tra informazione e segnale?

A) Non c'è differenza
B) Il segnale è il contenuto, l'informazione è il mezzo
C) L'informazione è il contenuto, il segnale è il mezzo fisico
D) Sono entrambi segnali fisici

✅ Risposta: C

2. Quale componente del ritardo dipende dalla congestione della rete?

A) Propagazione
B) Trasmissione
C) Processing
D) Coda

✅ Risposta: D

3. Cosa indica un BER molto basso?

A) Molti errori
B) Alta latenza
C) Alta integrità dei dati
D) Bassa velocità

✅ Risposta: C

4. Qual è il principale vantaggio dei segnali digitali?

A) Sono continui
B) Non subiscono mai errori
C) Sono più robusti al rumore
D) Non richiedono conversione

✅ Risposta: C

5. Il jitter rappresenta:

A) Il ritardo totale
B) La variazione del ritardo nel tempo
C) La velocità di trasmissione
D) Il numero di errori

✅ Risposta: B`;

  /** @type {{ stem: string, options: Record<string, string>, correct: string, hint: string, sourceIndex: number }[]} */
  let fullQuiz = [];
  /** @type {typeof fullQuiz} */
  let activeQuiz = [];
  let index = 0;
  /** @type {string | null} */
  let selected = null;
  let answered = false;
  /** @type {typeof fullQuiz} */
  let wrongBank = [];
  let isReviewMode = false;
  /** Testo sorgente dell’ultimo quiz avviato (per storico e ripristino). */
  let savedRawText = "";

  let saveSessionTimer = null;

  function loadStoredProgress() {
    try {
      return localStorage.getItem(PROGRESS_KEY);
    } catch (e) {
      return null;
    }
  }

  function clearStoredProgress() {
    try {
      localStorage.removeItem(PROGRESS_KEY);
    } catch (e) {}
  }

  function buildProgressPayload() {
    const onQuiz = !$("panel-quiz").hidden;
    const onResults = !$("panel-results").hidden;
    const panel = onQuiz ? "quiz" : onResults ? "results" : "input";

    /** @type {Record<string, unknown>} */
    const base = {
      v: STORAGE_VERSION,
      panel,
      rawText: savedRawText,
      fullQuiz,
      activeQuiz,
      index,
      wrongBank,
      isReviewMode,
      answered,
      selected,
      argText: $("arg-text").value,
      hintVisible: !$("hint-box").hidden,
    };

    if (panel === "results") {
      base.resultsUI = {
        scoreText: $("results-score").textContent,
        detailText: $("results-detail").textContent,
        showWrongList: !$("wrong-list").hidden,
        showReviewBtn: !$("btn-review").hidden,
      };
    }

    return base;
  }

  function saveSessionState() {
    const onInput = !$("panel-input").hidden;
    if (onInput && fullQuiz.length === 0) {
      clearStoredProgress();
      updateResumeBanner();
      return;
    }
    if (fullQuiz.length === 0) return;

    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(buildProgressPayload()));
    } catch (e) {}
    updateResumeBanner();
  }

  function saveSessionSoon() {
    if (saveSessionTimer) clearTimeout(saveSessionTimer);
    saveSessionTimer = setTimeout(() => {
      saveSessionTimer = null;
      saveSessionState();
    }, 80);
  }

  function updateResumeBanner() {
    const onInput = !$("panel-input").hidden;
    if (!onInput) {
      $("resume-banner").hidden = true;
      return;
    }

    const raw = loadStoredProgress();
    if (!raw) {
      $("resume-banner").hidden = true;
      return;
    }

    let p;
    try {
      p = JSON.parse(raw);
    } catch (e) {
      $("resume-banner").hidden = true;
      return;
    }

    if (p.v !== STORAGE_VERSION || !Array.isArray(p.fullQuiz) || p.fullQuiz.length === 0) {
      $("resume-banner").hidden = true;
      return;
    }

    const total = p.fullQuiz.length;
    const activeLen = (p.activeQuiz && p.activeQuiz.length) || total;
    let desc;
    if (p.panel === "results") {
      desc = `risultati aperti (${total} domande)`;
    } else {
      const i = Math.min(Math.max(0, p.index ?? 0), Math.max(0, activeLen - 1));
      desc = p.answered ? `domanda ${i + 1} di ${activeLen} (risposta data)` : `domanda ${i + 1} di ${activeLen}`;
    }

    $("resume-banner-text").textContent = `Hai un quiz in sospeso: ${desc}.`;
    $("resume-banner").hidden = false;
  }

  /**
   * @param {Record<string, unknown>} p
   */
  function applyProgressData(p) {
    savedRawText = typeof p.rawText === "string" ? p.rawText : "";
    $("raw-text").value = savedRawText;
    fullQuiz = Array.isArray(p.fullQuiz) ? p.fullQuiz : [];
    activeQuiz =
      Array.isArray(p.activeQuiz) && p.activeQuiz.length > 0 ? p.activeQuiz : fullQuiz.slice();
    const maxI = Math.max(0, activeQuiz.length - 1);
    index = Math.min(Math.max(0, Number(p.index) || 0), maxI);
    wrongBank = Array.isArray(p.wrongBank) ? p.wrongBank : [];
    isReviewMode = !!p.isReviewMode;
    answered = !!p.answered;
    selected = typeof p.selected === "string" ? p.selected : null;
  }

  /**
   * @param {Record<string, unknown>} p
   */
  function restoreResultsPanel(p) {
    const ui = p.resultsUI;
    if (ui && typeof ui === "object") {
      $("results-score").textContent = String(ui.scoreText || "");
      $("results-detail").textContent = String(ui.detailText || "");
      const showWrong = !!ui.showWrongList;
      $("wrong-list").hidden = !showWrong;
      $("btn-review").hidden = !ui.showReviewBtn;
      if (showWrong) fillWrongList(wrongBank);
    }
  }

  /**
   * @param {Record<string, unknown>} p
   */
  function restoreFromPayload(p) {
    applyProgressData(p);
    if (p.panel === "quiz") {
      showPanel("quiz");
      if (p.answered && p.selected && typeof p.selected === "string") {
        renderQuestion({
          answered: true,
          selected: p.selected,
          argText: typeof p.argText === "string" ? p.argText : "",
          hintVisible: !!p.hintVisible,
        });
      } else {
        renderQuestion();
      }
    } else if (p.panel === "results") {
      showPanel("results");
      restoreResultsPanel(p);
    } else {
      showPanel("input");
    }
  }

  function tryRestoreOnLoad() {
    const raw = loadStoredProgress();
    if (!raw) {
      updateResumeBanner();
      renderHistoryList();
      return;
    }

    let p;
    try {
      p = JSON.parse(raw);
    } catch (e) {
      clearStoredProgress();
      updateResumeBanner();
      renderHistoryList();
      return;
    }

    if (p.v !== STORAGE_VERSION || !Array.isArray(p.fullQuiz) || p.fullQuiz.length === 0) {
      clearStoredProgress();
      updateResumeBanner();
      renderHistoryList();
      return;
    }

    restoreFromPayload(p);
    renderHistoryList();
  }

  function abandonSession() {
    fullQuiz = [];
    activeQuiz = [];
    index = 0;
    wrongBank = [];
    isReviewMode = false;
    selected = null;
    answered = false;
    savedRawText = "";
    clearStoredProgress();
    showPanel("input");
  }

  function loadHistory() {
    try {
      const s = localStorage.getItem(HISTORY_KEY);
      if (!s) return [];
      const a = JSON.parse(s);
      return Array.isArray(a) ? a : [];
    } catch (e) {
      return [];
    }
  }

  function writeHistory(arr) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(arr));
    } catch (e) {}
  }

  function makeTitleFromRaw(raw) {
    const line = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (!line) return "Quiz senza titolo";
    const cleaned = stripMd(line)
      .replace(/^#{1,6}\s+/, "")
      .replace(/^(\d+)[\.\)]\s*/, "")
      .trim();
    return cleaned.slice(0, 72) + (cleaned.length > 72 ? "…" : "");
  }

  function addHistoryEntry(rawText) {
    const n = fullQuiz.length || parseQuizText(rawText).length;
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      title: makeTitleFromRaw(rawText),
      rawText,
      savedAt: new Date().toISOString(),
      questionCount: n,
    };
    const arr = loadHistory();
    arr.unshift(entry);
    writeHistory(arr);
    renderHistoryList();
  }

  function removeHistoryEntry(id) {
    writeHistory(loadHistory().filter((x) => x.id !== id));
    renderHistoryList();
  }

  function renderHistoryList() {
    const ul = $("history-list");
    const empty = $("history-empty");
    const items = loadHistory().slice().sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

    ul.innerHTML = "";
    if (items.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    items.forEach((entry) => {
      const li = document.createElement("li");
      li.className = "history-item";

      const main = document.createElement("div");
      main.className = "history-item-main";
      const titleEl = document.createElement("span");
      titleEl.className = "history-item-title";
      titleEl.textContent = entry.title || "Quiz";
      const meta = document.createElement("span");
      meta.className = "history-item-meta";
      const d = new Date(entry.savedAt);
      const dateStr = d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
      meta.textContent = `${entry.questionCount || "?"} domande · ${dateStr}`;
      main.appendChild(titleEl);
      main.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "history-item-actions";
      const btnLoad = document.createElement("button");
      btnLoad.type = "button";
      btnLoad.className = "btn btn-primary btn-small";
      btnLoad.textContent = "Carica";
      btnLoad.addEventListener("click", () => {
        $("raw-text").value = entry.rawText;
        startFromText(entry.rawText);
      });
      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "btn btn-ghost btn-small";
      btnDel.textContent = "Cestina";
      btnDel.addEventListener("click", () => removeHistoryEntry(entry.id));
      actions.appendChild(btnLoad);
      actions.appendChild(btnDel);

      li.appendChild(main);
      li.appendChild(actions);
      ul.appendChild(li);
    });
  }

  function showPanel(name) {
    $("panel-input").hidden = name !== "input";
    $("panel-quiz").hidden = name !== "quiz";
    $("panel-results").hidden = name !== "results";
    updateResumeBanner();
  }

  function setProgress() {
    const total = activeQuiz.length;
    const n = Math.min(index + (answered ? 1 : 0), total);
    const pct = total ? Math.round((n / total) * 100) : 0;
    $("progress-fill").style.width = `${pct}%`;
    $("progress-label").textContent = `${n} / ${total}`;
    const bar = $("progress-bar");
    if (bar) bar.setAttribute("aria-valuenow", String(pct));
  }

  /**
   * @param {{ answered: boolean, selected: string, argText: string, hintVisible: boolean } | undefined} restore
   */
  function renderQuestion(restore) {
    const q = activeQuiz[index];
    if (!q) return;

    if (!restore || !restore.answered) {
      selected = null;
      answered = false;
    }

    $("question-meta").textContent = isReviewMode
      ? `Ripasso · domanda ${index + 1} di ${activeQuiz.length}`
      : `Domanda ${index + 1} di ${activeQuiz.length}`;

    $("question-text").textContent = q.stem;

    const opts = $("options");
    opts.innerHTML = "";
    ["A", "B", "C", "D"].forEach((key) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option";
      btn.dataset.key = key;
      btn.innerHTML = `<span class="option-key">${key}</span><span class="option-body">${escapeHtml(q.options[key])}</span>`;
      btn.addEventListener("click", () => {
        if (answered) return;
        selected = key;
        opts.querySelectorAll(".option").forEach((el) => el.classList.remove("selected"));
        btn.classList.add("selected");
        $("btn-submit").disabled = false;
      });
      opts.appendChild(btn);
    });

    if (restore && restore.answered) {
      applyAnsweredUI(q, restore.selected, restore.argText, restore.hintVisible);
      return;
    }

    $("arg-text").value = "";
    $("hint-box").hidden = true;
    $("hint-box").textContent = "";
    $("feedback").hidden = true;
    $("feedback").className = "feedback";
    $("feedback").textContent = "";

    $("btn-submit").disabled = true;
    $("btn-hint").hidden = !q.hint;
    $("btn-hint").textContent = "Mostra suggerimento";

    setProgress();
  }

  function argomentazioneFeedback(ok, argText) {
    const t = argText.trim();
    if (!t) return "";
    if (t.length < 15) return "Hai aggiunto un'argomentazione breve: va bene per un ripasso veloce.";
    if (ok) return "Argomentazione presente: ottimo per fissare i concetti a voce.";
    return "Anche con un'argomentazione, la lettera corretta è un'altra: confronta con il suggerimento o il libro.";
  }

  /**
   * @param {typeof fullQuiz[0]} q
   * @param {string} selectedKey
   * @param {string} argText
   * @param {boolean} hintVisible
   */
  function applyAnsweredUI(q, selectedKey, argText, hintVisible) {
    answered = true;
    selected = selectedKey;
    $("arg-text").value = argText;

    const ok = selectedKey === q.correct;

    $("options").querySelectorAll(".option").forEach((el) => {
      const k = el.dataset.key;
      el.disabled = true;
      if (k === q.correct) el.classList.add("correct-reveal");
      if (k === selectedKey && k !== q.correct) el.classList.add("wrong-reveal");
      if (k === selectedKey) el.classList.add("selected");
    });

    const fb = $("feedback");
    fb.hidden = false;
    fb.className = `feedback ${ok ? "ok" : "bad"}`;
    const argFb = argomentazioneFeedback(ok, argText);
    if (ok) {
      fb.innerHTML = `<strong>Esatto.</strong> La risposta corretta è ${q.correct}.${argFb ? `<br/><span class="muted-inline">${escapeHtml(argFb)}</span>` : ""}`;
    } else {
      fb.innerHTML = `<strong>Sbagliato.</strong> La risposta corretta è <strong>${q.correct}</strong>: ${escapeHtml(q.options[q.correct])}.${argFb ? `<br/><span class="muted-inline">${escapeHtml(argFb)}</span>` : ""}`;
    }

    $("btn-submit").textContent =
      index < activeQuiz.length - 1 ? "Continua" : isReviewMode ? "Termina ripasso" : "Vedi risultati";
    $("btn-submit").disabled = false;

    if (hintVisible && q.hint) {
      $("hint-box").hidden = false;
      $("hint-box").innerHTML = `<strong>Suggerimento</strong><br/>${escapeHtml(q.hint)}`;
      $("btn-hint").hidden = false;
      $("btn-hint").textContent = "Suggerimento mostrato";
    } else {
      $("hint-box").hidden = true;
      $("btn-hint").hidden = !q.hint;
      $("btn-hint").textContent = "Mostra suggerimento";
    }

    setProgress();
  }

  function pushWrong(q) {
    const dup = wrongBank.some((x) => x.sourceIndex === q.sourceIndex && x.stem === q.stem);
    if (!dup) wrongBank.push({ ...q });
  }

  function revealAndFeedback() {
    const q = activeQuiz[index];
    if (!q || !selected) return;

    const arg = $("arg-text").value;
    const ok = selected === q.correct;
    if (!ok) pushWrong(q);

    const hintShown = !$("hint-box").hidden;
    applyAnsweredUI(q, selected, arg, hintShown);
    saveSessionSoon();
  }

  function fillWrongList(items) {
    const wi = $("wrong-items");
    wi.innerHTML = "";
    items.forEach((q) => {
      const li = document.createElement("li");
      const short = q.stem.replace(/\n/g, " ");
      li.textContent = short.slice(0, 120) + (short.length > 120 ? "…" : "");
      wi.appendChild(li);
    });
  }

  function finishQuiz() {
    const total = fullQuiz.length;
    const wrongCount = wrongBank.length;
    const right = total - wrongCount;
    showPanel("results");
    $("results-score").textContent = `${right} / ${total} corrette`;
    $("results-detail").textContent =
      wrongCount === 0
        ? "Ottimo lavoro: nessun errore da ripassare."
        : `${wrongCount} domanda/e da ripassare. Puoi rifare solo quelle sbagliate.`;

    if (wrongCount > 0) {
      $("wrong-list").hidden = false;
      fillWrongList(wrongBank);
      $("btn-review").hidden = false;
    } else {
      $("wrong-list").hidden = true;
      $("btn-review").hidden = true;
    }
    saveSessionSoon();
  }

  function finishReview() {
    showPanel("results");
    $("results-score").textContent = "Ripasso completato";
    const still = wrongBank.length;
    $("results-detail").textContent =
      still === 0
        ? "Hai risposto bene a tutte le domande del ripasso."
        : `Nel ripasso, ${still} domanda/e sono ancora errate. Puoi ripetere il ripasso su quelle.`;

    if (still > 0) {
      $("wrong-list").hidden = false;
      fillWrongList(wrongBank);
      $("btn-review").hidden = false;
    } else {
      $("wrong-list").hidden = true;
      $("btn-review").hidden = true;
    }
    saveSessionSoon();
  }

  function startFromText(text) {
    const parsed = parseQuizText(text);
    if (parsed.length === 0) {
      $("parse-error").hidden = false;
      $("parse-error").textContent =
        "Non ho trovato domande valide. La domanda può essere «1. …» o in Markdown «### **1. …**»; servono «A) …» … «D) …» e «Risposta: X» o «✅ **Risposta: X**». Righe «---» sono ignorate. Opzionale: «💡 Suggerimento: …» dopo la risposta.";
      return;
    }
    $("parse-error").hidden = true;
    savedRawText = text;
    fullQuiz = parsed;
    activeQuiz = parsed.slice();
    wrongBank = [];
    index = 0;
    isReviewMode = false;
    selected = null;
    answered = false;
    showPanel("quiz");
    renderQuestion();
    $("btn-submit").textContent = "Conferma risposta";
    saveSessionSoon();
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  $("btn-parse").addEventListener("click", () => {
    startFromText($("raw-text").value);
  });

  $("btn-sample").addEventListener("click", () => {
    $("raw-text").value = SAMPLE;
    startFromText(SAMPLE);
  });

  $("btn-reset").addEventListener("click", () => {
    abandonSession();
  });

  $("btn-resume").addEventListener("click", () => {
    const raw = loadStoredProgress();
    if (!raw) return;
    try {
      const p = JSON.parse(raw);
      if (p.v === STORAGE_VERSION && Array.isArray(p.fullQuiz) && p.fullQuiz.length > 0) {
        restoreFromPayload(p);
      }
    } catch (e) {}
  });

  $("btn-discard-progress").addEventListener("click", () => {
    clearStoredProgress();
    updateResumeBanner();
  });

  $("btn-submit").addEventListener("click", () => {
    if (!answered) {
      revealAndFeedback();
      return;
    }
    if (index < activeQuiz.length - 1) {
      index += 1;
      $("btn-submit").textContent = "Conferma risposta";
      renderQuestion();
      saveSessionSoon();
    } else if (isReviewMode) {
      finishReview();
    } else {
      finishQuiz();
    }
  });

  $("btn-hint").addEventListener("click", () => {
    const q = activeQuiz[index];
    if (!q || !q.hint) return;
    $("hint-box").hidden = false;
    $("hint-box").innerHTML = `<strong>Suggerimento</strong><br/>${escapeHtml(q.hint)}`;
    $("btn-hint").textContent = "Suggerimento mostrato";
    saveSessionSoon();
  });

  $("btn-review").addEventListener("click", () => {
    if (wrongBank.length === 0) return;
    activeQuiz = shuffle(wrongBank.map((q) => ({ ...q })));
    index = 0;
    isReviewMode = true;
    wrongBank = [];
    showPanel("quiz");
    $("btn-submit").textContent = "Conferma risposta";
    renderQuestion();
    saveSessionSoon();
  });

  $("btn-retry-all").addEventListener("click", () => {
    activeQuiz = fullQuiz.slice();
    index = 0;
    wrongBank = [];
    isReviewMode = false;
    showPanel("quiz");
    $("btn-submit").textContent = "Conferma risposta";
    renderQuestion();
    saveSessionSoon();
  });

  $("btn-save-history").addEventListener("click", () => {
    const raw = (savedRawText || $("raw-text").value || "").trim();
    if (!raw) return;
    addHistoryEntry(raw);
  });

  tryRestoreOnLoad();
})();
