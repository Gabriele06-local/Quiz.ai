(function (Q) {
  const $ = Q.$;
  const escapeHtml = Q.escapeHtml;
  const parseQuizText = Q.parseQuizText;
  const stripMd = Q.stripMd;
  const getSupabase = Q.getSupabase;
  const StudyModeUtils = Q.StudyModeUtils;

  const PROGRESS_KEY = "quiz-ai-progress";
const STORAGE_VERSION = 3;

function isSupportedStorageVersion(v) {
  return v === 2 || v === 3;
}

const STUDY_FORMAT_SAMPLES = {
  mcq: `1. Qual è la differenza principale tra informazione e segnale?

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

✅ Risposta: B`,

  fill_bank: `Esempio per «Completamento con parole suggerite»: nel testo della domanda deve comparire una parola (o segmento) identico al testo dell’opzione corretta, così l’app può mostrare un buco al suo posto.

---

1. Nei sistemi a pacchetto, il protocollo TCP lavora spesso in coppia con IP e offre trasferimento affidabile.

A) UDP
B) TCP
C) ICMP
D) ARP

Risposta: B

---

2. La capitale politica d’Italia è Roma; Milano è invece nota come polo economico.

A) Milano
B) Roma
C) Firenze
D) Napoli

Risposta: B

---

3. In fisica, la frequenza si misura in Hertz, cioè cicli al secondo.

A) Watt
B) Volt
C) Hertz
D) Pascal

Risposta: C`,

  fill_open: `Esempio per «Completamento — scrivi tu»: tieni le risposte corrette brevi (numero, nome, parola chiave) così il confronto con quello che digiti è chiaro.

---

1. Quanti bit ha un indirizzo IPv4?

A) 16
B) 32
C) 64
D) 128

Risposta: B

---

2. Chi dipinse la Gioconda?

A) Michelangelo
B) Leonardo
C) Raffaello
D) Caravaggio

Risposta: B

---

3. In quale anno cadde l’Impero romano d’Occidente (data convenzionale)?

A) 376
B) 476
C) 576
D) 676

Risposta: B`,

  match: `Esempio per «Abbina descrizione ↔ risposta»: enunciati lunghi e autosufficienti; come risposta corretta usa un’etichetta breve e diversa per ogni domanda (così a destra non compaiono duplicati ambigui).

---

1. Metodo degli array in JavaScript che crea un nuovo array contenente solo gli elementi che superano una condizione passata come funzione.

A) slice
B) filter
C) sort
D) join

Risposta: B

---

2. Metodo che aggiunge uno o più elementi alla fine dell’array modificando lo stesso array.

A) shift
B) pop
C) push
D) unshift

Risposta: C

---

3. Struttura dati lineare in cui il primo elemento inserito è anche il primo uscito (First In, First Out).

A) stack
B) heap
C) queue
D) tree

Risposta: C`,

  flash: `Esempio per «Flashcard»: domande secche sul fronte; sul retro vedi lettera + risposta e, se c’è, un suggerimento per fissare il concetto.

---

1. Cos’è la latenza in una rete di telecomunicazioni?

A) Solo la velocità del clock della CPU
B) Il tempo impiegato da un messaggio per andare da sorgente a destinazione
C) Il numero di pixel del monitor
D) La capacità del disco rigido

Risposta: B
Suggerimento: non è throughput: è un ritardo temporale.

---

2. Cosa indica il BER?

A) La banda massima del canale
B) La frequenza di errore sui bit trasmessi
C) Il numero di router attraversati
D) La dimensione massima del pacchetto

Risposta: B
💡 Suggerimento: Bit Error Rate.

---

3. Nel modello OSI, a quale livello si colloca tipicamente HTTP?

A) Trasporto
B) Applicazione
C) Rete
D) Fisico

Risposta: B
Hint: pensa a browser e API REST.`,
};

/**
 * @param {string} [fmt]
 */
function getStudyFormatSampleText(fmt) {
  const v = fmt || readStudyFormatFromUI();
  if (v === "fill_bank" || v === "fill_open" || v === "match" || v === "flash") {
    return STUDY_FORMAT_SAMPLES[v];
  }
  return STUDY_FORMAT_SAMPLES.mcq;
}


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
let savedRawText = "";
let saveSessionTimer = null;
let examMode = false;
/** @type {{ savedQuizId: string | null, folderId: string | null } | null} */
let attemptContext = null;
/** N° domande all’inizio del ripasso (per statistiche). */
let reviewSessionTotal = 0;
/** Evita duplicati in lista quando più chiamate a renderHistoryList si sovrappongono (auth + load). */
let historyListRenderGeneration = 0;

const PREF_SHUFFLE = "quiz-ai-pref-shuffle";
const PREF_TIMER_ON = "quiz-ai-pref-timer-on";
const PREF_TIMER_MODE = "quiz-ai-pref-timer-mode";
const PREF_TIMER_SEC = "quiz-ai-pref-timer-sec";
const PREF_EXAM = "quiz-ai-pref-exam";

/** @type {ReturnType<typeof setInterval> | null} */
let quizTimerIntervalId = null;
/** @type {"off" | "question" | "quiz"} */
let sessionTimerMode = "off";
let sessionTimerSeconds = 60;
let quizWideTimerStarted = false;
let questionDeadlineMs = 0;
let quizWideDeadlineMs = 0;

/** @type {"mcq"|"fill_bank"|"fill_open"|"match"|"flash"} */
let studyFormat = "mcq";
const MATCH_BATCH = 4;
let matchBatchStart = 0;
/** @type {Set<number>} */
let matchPairedSi = new Set();
/** @type {number | null} */
let matchPickLeftSi = null;
/** @type {Record<number, number>} */
let matchErrorsBySi = {};
let matchCumulativePaired = 0;
let flashShowBack = false;
/** @type {string | null} */
let fillBankSelectedKey = null;

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
    examMode,
    attemptContext: attemptContext
      ? { savedQuizId: attemptContext.savedQuizId, folderId: attemptContext.folderId }
      : null,
    reviewSessionTotal: isReviewMode ? reviewSessionTotal : 0,
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
  if (studyFormat !== "mcq") return;
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

  if (!isSupportedStorageVersion(p.v) || !Array.isArray(p.fullQuiz) || p.fullQuiz.length === 0) {
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
    const ex = p.v === 3 && p.examMode ? " · esame" : "";
    desc = p.answered
      ? `domanda ${i + 1} di ${activeLen} (risposta data)${ex}`
      : `domanda ${i + 1} di ${activeLen}${ex}`;
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
  examMode = p.v === 3 && !!p.examMode;
  if (p.v === 3 && p.attemptContext && typeof p.attemptContext === "object") {
    const ac = p.attemptContext;
    attemptContext = {
      savedQuizId: typeof ac.savedQuizId === "string" ? ac.savedQuizId : null,
      folderId: typeof ac.folderId === "string" ? ac.folderId : null,
    };
  } else {
    attemptContext = null;
  }
  reviewSessionTotal = typeof p.reviewSessionTotal === "number" ? p.reviewSessionTotal : 0;
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
    studyFormat = "mcq";
    sessionTimerMode = "off";
    quizWideTimerStarted = false;
    clearQuizTimerVisual();
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
    void renderHistoryList();
    return;
  }

  let p;
  try {
    p = JSON.parse(raw);
  } catch (e) {
    clearStoredProgress();
    updateResumeBanner();
    void renderHistoryList();
    return;
  }

  if (!isSupportedStorageVersion(p.v) || !Array.isArray(p.fullQuiz) || p.fullQuiz.length === 0) {
    clearStoredProgress();
    updateResumeBanner();
    void renderHistoryList();
    return;
  }

  restoreFromPayload(p);
  void renderHistoryList();
}

function abandonSession() {
  sessionTimerMode = "off";
  quizWideTimerStarted = false;
  examMode = false;
  attemptContext = null;
  reviewSessionTotal = 0;
  studyFormat = "mcq";
  resetMatchStudyState();
  flashShowBack = false;
  fillBankSelectedKey = null;
  syncQuizBodies("mcq");
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

const TRASH_ICON_HTML =
  '<svg class="icon-trash" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

function setTrashButtonContent(btn, label) {
  btn.classList.add("btn-with-trash");
  btn.textContent = "";
  const holder = document.createElement("span");
  holder.className = "btn-icon-wrap";
  holder.innerHTML = TRASH_ICON_HTML;
  btn.appendChild(holder);
  const lab = document.createElement("span");
  lab.textContent = label;
  btn.appendChild(lab);
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

function showHistorySaveError(msg) {
  const okEl = $("history-import-ok");
  if (okEl) {
    okEl.hidden = true;
    okEl.textContent = "";
  }
  const el = $("history-save-error");
  if (el) {
    el.textContent = msg;
    el.hidden = false;
  }
}

function hideHistorySaveError() {
  const el = $("history-save-error");
  if (el) el.hidden = true;
}

let historyImportOkTimer = 0;
function showHistoryImportOk(msg) {
  hideHistorySaveError();
  const el = $("history-import-ok");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  window.clearTimeout(historyImportOkTimer);
  historyImportOkTimer = window.setTimeout(() => {
    el.hidden = true;
    el.textContent = "";
  }, 6000);
}

/**
 * @param {(format: "json" | "txt" | "md") => void} onFormat
 */
function createExportFormatRow(onFormat) {
  if (!Q.QuizBackup) return document.createDocumentFragment();
  const d = document.createElement("details");
  d.className = "history-export-details";
  const s = document.createElement("summary");
  s.className = "history-export-summary";
  s.textContent = "Esporta";
  const row = document.createElement("div");
  row.className = "history-export-row";
  const specs = [
    { fmt: "json", label: "JSON", title: "Backup da reimportare qui con «Importa backup»" },
    { fmt: "txt", label: "Testo", title: "Un file leggibile; per reimportare usa il JSON" },
    { fmt: "md", label: "MD", title: "Markdown; per reimportare usa il JSON" },
  ];
  specs.forEach(({ fmt, label, title }) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-ghost btn-small history-export-btn";
    b.textContent = label;
    b.title = title;
    b.addEventListener("click", (e) => {
      e.preventDefault();
      d.open = false;
      onFormat(fmt);
    });
    row.appendChild(b);
  });
  d.appendChild(s);
  d.appendChild(row);
  return d;
}

/**
 * Inserisce una riga in saved_quizzes (cloud). Usato da home e da pannello quiz.
 * @param {string} rawText
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
async function insertSavedQuizRow(rawText) {
  const trimmed = (rawText || "").trim();
  if (!trimmed) return { ok: false, message: "Nessun testo da salvare." };
  const sb = getSupabase();
  if (!sb) return { ok: false, message: "Account cloud non configurato." };
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) return { ok: false, message: "Accedi per salvare nel database." };
  const n = fullQuiz.length || parseQuizText(trimmed).length;
  if (n === 0) return { ok: false, message: "Non ci sono domande riconosciute nel testo." };
  const title = makeTitleFromRaw(trimmed);
  const { error } = await sb.from("saved_quizzes").insert({
    user_id: session.user.id,
    folder_id: null,
    title,
    raw_text: trimmed,
    question_count: n,
  });
  if (error) return { ok: false, message: error.message || "Salvataggio non riuscito." };
  return { ok: true };
}

async function addHistoryEntry(rawText) {
  hideHistorySaveError();
  const r = await insertSavedQuizRow(rawText);
  if (!r.ok) {
    showHistorySaveError(r.message);
    return;
  }
  await renderHistoryList();
}

let quizCloudSaveFeedbackTimer = 0;
function showQuizCloudSaveFeedback(message, isError) {
  const el = $("quiz-cloud-save-feedback");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  el.classList.toggle("quiz-cloud-save-feedback--error", !!isError);
  window.clearTimeout(quizCloudSaveFeedbackTimer);
  quizCloudSaveFeedbackTimer = window.setTimeout(() => {
    el.hidden = true;
    el.textContent = "";
    el.classList.remove("quiz-cloud-save-feedback--error");
  }, 3200);
}

function syncQuizCloudSaveButton() {
  const btn = $("btn-save-quiz-cloud");
  if (!btn) return;
  const onQuiz = !$("panel-quiz").hidden;
  const hasQuiz = fullQuiz.length > 0;
  btn.hidden = !(onQuiz && hasQuiz);
}

async function saveCurrentQuizToCloudFromPanel() {
  const raw = (savedRawText || $("raw-text")?.value || "").trim();
  const r = await insertSavedQuizRow(raw);
  if (!r.ok) {
    showQuizCloudSaveFeedback(r.message, true);
    return;
  }
  await renderHistoryList();
  showQuizCloudSaveFeedback("Quiz salvato negli appunti cloud. Puoi continuare il test.", false);
}

async function removeHistoryEntry(id) {
  const sb = getSupabase();
  if (sb) await sb.from("saved_quizzes").delete().eq("id", id);
  await renderHistoryList();
}

function promptRename(title, current) {
  const v = window.prompt(title, current);
  if (v === null) return null;
  const t = v.trim();
  return t.length ? t : null;
}

async function renameHistoryQuiz(entry, newTitle) {
  if (!newTitle || newTitle === entry.title) return;
  const sb = getSupabase();
  if (sb) await sb.from("saved_quizzes").update({ title: newTitle }).eq("id", entry.id);
  await renderHistoryList();
}

/** @param {string | null} folderId */
async function moveHistoryQuiz(entry, folderId) {
  const sb = getSupabase();
  if (sb) await sb.from("saved_quizzes").update({ folder_id: folderId || null }).eq("id", entry.id);
  await renderHistoryList();
}

async function createDbFolder(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return;
  hideHistorySaveError();
  const sb = getSupabase();
  if (!sb) return;
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) return;
  const { data: existing } = await sb.from("saved_quiz_folders").select("name");
  const norm = normalizeFolderKey(trimmed);
  if (existing?.some((r) => normalizeFolderKey(r.name) === norm)) {
    showHistorySaveError("Esiste già una cartella con questo nome.");
    return;
  }
  await sb.from("saved_quiz_folders").insert({ user_id: session.user.id, name: trimmed });
  await renderHistoryList();
}

/**
 * Chiave stabile per confrontare nomi cartella (spazi, Unicode, caratteri invisibili).
 * @param {string | null | undefined} name
 */
function normalizeFolderKey(name) {
  return (name || "")
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Unisce nel DB le righe duplicate (stessa chiave normalizzata): quiz → cartella più vecchia, poi delete duplicati.
 * @param {ReturnType<typeof getSupabase>} sb
 */
async function consolidateFolderDuplicatesInDb(sb) {
  const { data: frows } = await sb
    .from("saved_quiz_folders")
    .select("id,name,created_at")
    .order("created_at", { ascending: true });
  if (!frows?.length) return;
  const groups = groupFolderRows(frows);
  for (const g of groups) {
    if (g.ids.length <= 1) continue;
    const keep = g.canonicalId;
    for (const rid of g.ids) {
      if (rid === keep) continue;
      await sb.from("saved_quizzes").update({ folder_id: keep }).eq("folder_id", rid);
      await sb.from("saved_quiz_folders").delete().eq("id", rid);
    }
  }
}

/**
 * Raggruppa cartelle DB con lo stesso nome (chiave normalizzata) per non mostrare duplicati.
 * @param {{ id: string, name: string, created_at: string }[]} frows
 * @returns {{ ids: string[], displayName: string, canonicalId: string }[]}
 */
function groupFolderRows(frows) {
  /** @type Map<string, { ids: string[], displayName: string, oldest: string, canonicalId: string }> */
  const map = new Map();
  for (const f of frows) {
    const key = normalizeFolderKey(f.name);
    if (!key) continue;
    const cur = map.get(key);
    if (!cur) {
      map.set(key, {
        ids: [f.id],
        displayName: f.name.trim(),
        oldest: f.created_at,
        canonicalId: f.id,
      });
    } else {
      cur.ids.push(f.id);
      if (f.created_at < cur.oldest) {
        cur.oldest = f.created_at;
        cur.canonicalId = f.id;
        cur.displayName = f.name.trim();
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.displayName.localeCompare(b.displayName, "it"));
}

async function renameDbFolderGroup(ids, name) {
  const sb = getSupabase();
  if (!sb || !ids.length) return;
  await sb.from("saved_quiz_folders").update({ name }).in("id", ids);
  await renderHistoryList();
}

async function deleteDbFolderGroup(ids) {
  const sb = getSupabase();
  if (!sb || !ids.length) return;
  await sb.from("saved_quiz_folders").delete().in("id", ids);
  await renderHistoryList();
}

/**
 * @param {{ id: string, name: string }[]} folderOpts id = canonicalId per gruppo
 * @param {string | null} currentFolderId
 * @param {{ ids: string[], canonicalId: string }[] | null} folderGroups
 */
function makeFolderSelect(folderOpts, currentFolderId, folderGroups) {
  let selected = currentFolderId || "";
  if (selected && folderGroups) {
    for (const g of folderGroups) {
      if (g.ids.includes(selected)) {
        selected = g.canonicalId;
        break;
      }
    }
  }
  const sel = document.createElement("select");
  sel.className = "history-folder-select";
  sel.setAttribute("aria-label", "Sposta in cartella");
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "— Senza cartella —";
  sel.appendChild(opt0);
  folderOpts
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "it"))
    .forEach((f) => {
      const o = document.createElement("option");
      o.value = f.id;
      o.textContent = f.name;
      if (f.id === selected) o.selected = true;
      sel.appendChild(o);
    });
  return sel;
}

function buildHistoryQuizRow(entry, folderOpts, folderGroups) {
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

  const btnRen = document.createElement("button");
  btnRen.type = "button";
  btnRen.className = "btn btn-ghost btn-small";
  btnRen.textContent = "Rinomina";
  btnRen.addEventListener("click", async () => {
    const n = promptRename("Nuovo titolo (solo etichetta, non modifica il testo del quiz):", entry.title);
    if (n) await renameHistoryQuiz(entry, n);
  });

  const sel = makeFolderSelect(folderOpts, entry.folderId || null, folderGroups);
  sel.addEventListener("change", async () => {
    const v = sel.value || null;
    await moveHistoryQuiz(entry, v);
  });

  const btnLoad = document.createElement("button");
  btnLoad.type = "button";
  btnLoad.className = "btn btn-primary btn-small";
  btnLoad.textContent = "Carica";
  btnLoad.addEventListener("click", () => {
    $("raw-text").value = entry.rawText;
    startFromText(entry.rawText, entry);
  });
  const btnDel = document.createElement("button");
  btnDel.type = "button";
  btnDel.className = "btn btn-ghost btn-small";
  setTrashButtonContent(btnDel, "Cestina");
  btnDel.addEventListener("click", () => removeHistoryEntry(entry.id));

  actions.appendChild(btnRen);
  actions.appendChild(sel);
  actions.appendChild(btnLoad);
  actions.appendChild(
    createExportFormatRow((fmt) => {
      Q.QuizBackup?.exportSingleQuiz(entry, fmt);
    })
  );
  actions.appendChild(btnDel);

  li.appendChild(main);
  li.appendChild(actions);
  return li;
}

/**
 * @param {{ ids: string[], displayName: string, canonicalId: string }} group
 */
function appendFolderDetailsBlock(ul, group, entries, folderOpts, folderGroups) {
  const wrap = document.createElement("li");
  wrap.className = "history-folder-wrap";

  const details = document.createElement("details");
  details.className = "history-folder-details";

  const summary = document.createElement("summary");
  summary.className = "history-folder-summary";

  const nameSpan = document.createElement("span");
  nameSpan.className = "history-folder-name";
  nameSpan.textContent = group.displayName;

  const countSpan = document.createElement("span");
  countSpan.className = "history-folder-count";
  countSpan.textContent = ` (${entries.length})`;

  summary.appendChild(nameSpan);
  summary.appendChild(countSpan);

  const toolbar = document.createElement("div");
  toolbar.className = "history-folder-toolbar";

  const btnRenF = document.createElement("button");
  btnRenF.type = "button";
  btnRenF.className = "btn btn-ghost btn-small";
  btnRenF.textContent = "Rinomina cartella";
  btnRenF.addEventListener("click", async (e) => {
    e.preventDefault();
    const n = promptRename("Nuovo nome cartella:", group.displayName);
    if (n) await renameDbFolderGroup(group.ids, n.trim());
  });

  const btnDelF = document.createElement("button");
  btnDelF.type = "button";
  btnDelF.className = "btn btn-ghost btn-small";
  setTrashButtonContent(btnDelF, "Elimina cartella");
  btnDelF.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!window.confirm("Eliminare la cartella? I quiz restano senza cartella.")) return;
    await deleteDbFolderGroup(group.ids);
  });

  toolbar.appendChild(btnRenF);
  toolbar.appendChild(btnDelF);
  toolbar.appendChild(
    createExportFormatRow((fmt) => {
      Q.QuizBackup?.exportFolder(group.displayName, entries, fmt);
    })
  );

  const nested = document.createElement("ul");
  nested.className = "history-nested";
  entries.forEach((entry) => {
    nested.appendChild(buildHistoryQuizRow(entry, folderOpts, folderGroups));
  });

  details.appendChild(summary);
  details.appendChild(toolbar);
  details.appendChild(nested);
  wrap.appendChild(details);
  ul.appendChild(wrap);
}

function appendRootDetailsBlock(ul, entries, folderOpts, folderGroups) {
  const wrap = document.createElement("li");
  wrap.className = "history-folder-wrap history-folder-wrap--root";

  const details = document.createElement("details");
  details.className = "history-folder-details";

  const summary = document.createElement("summary");
  summary.className = "history-folder-summary";

  const nameSpan = document.createElement("span");
  nameSpan.className = "history-folder-name";
  nameSpan.textContent = "Senza cartella";

  const countSpan = document.createElement("span");
  countSpan.className = "history-folder-count";
  countSpan.textContent = ` (${entries.length})`;

  summary.appendChild(nameSpan);
  summary.appendChild(countSpan);

  const toolbarRoot = document.createElement("div");
  toolbarRoot.className = "history-folder-toolbar";
  toolbarRoot.appendChild(
    createExportFormatRow((fmt) => {
      Q.QuizBackup?.exportRootBlock(entries, fmt);
    })
  );

  const nested = document.createElement("ul");
  nested.className = "history-nested";
  entries.forEach((entry) => {
    nested.appendChild(buildHistoryQuizRow(entry, folderOpts, folderGroups));
  });

  details.appendChild(summary);
  details.appendChild(toolbarRoot);
  details.appendChild(nested);
  wrap.appendChild(details);
  ul.appendChild(wrap);
}

async function renderHistoryList() {
  const myGen = ++historyListRenderGeneration;
  hideHistorySaveError();
  const ul = $("history-list");
  const empty = $("history-empty");
  const authHint = $("history-auth-hint");
  const toolbar = $("history-toolbar");
  const sb = getSupabase();
  let session = null;
  if (sb) {
    const { data } = await sb.auth.getSession();
    session = data.session;
  }
  if (myGen !== historyListRenderGeneration) return;
  if (!ul) return;

  ul.innerHTML = "";

  if (!session) {
    if (authHint) {
      authHint.hidden = false;
      authHint.textContent = "Accedi per vedere e salvare lo storico nel database.";
    }
    if (empty) empty.hidden = true;
    if (toolbar) toolbar.hidden = true;
    try {
      localStorage.removeItem("quiz-ai-history");
    } catch (e) {}
    return;
  }

  if (authHint) authHint.hidden = true;
  if (toolbar) toolbar.hidden = false;

  /** @type {{ ids: string[], displayName: string, canonicalId: string }[]} */
  let folderGroups = [];
  /** @type {{ id: string, name: string }[]} */
  let folderOpts = [];
  /** @type {{ id: string, title: string, rawText: string, questionCount: number, savedAt: string, folderId: string | null }[]} */
  let rows = [];
  if (sb) {
    await consolidateFolderDuplicatesInDb(sb);
    if (myGen !== historyListRenderGeneration) return;
    const { data: frows } = await sb
      .from("saved_quiz_folders")
      .select("id,name,created_at")
      .order("created_at", { ascending: true });
    if (myGen !== historyListRenderGeneration) return;
    folderGroups = groupFolderRows(frows || []);
    folderOpts = folderGroups.map((g) => ({ id: g.canonicalId, name: g.displayName }));
    const { data, error } = await sb
      .from("saved_quizzes")
      .select("id,title,raw_text,question_count,created_at,folder_id")
      .order("created_at", { ascending: false });
    if (myGen !== historyListRenderGeneration) return;
    if (!error && data) {
      rows = data.map((row) => ({
        id: row.id,
        title: row.title,
        rawText: row.raw_text,
        questionCount: row.question_count,
        savedAt: row.created_at,
        folderId: row.folder_id || null,
      }));
    }
  }

  if (myGen !== historyListRenderGeneration) return;

  const hasStuff = rows.length > 0 || folderGroups.length > 0;
  if (!hasStuff) {
    if (empty) {
      empty.hidden = false;
      empty.textContent = "Nessun quiz salvato. Dai risultati usa «Salva negli appunti».";
    }
    return;
  }
  if (empty) empty.hidden = true;

  for (const g of folderGroups) {
    const entries = rows.filter((r) => r.folderId && g.ids.includes(r.folderId));
    appendFolderDetailsBlock(ul, g, entries, folderOpts, folderGroups);
  }
  const rootRows = rows.filter((r) => !r.folderId);
  if (rootRows.length > 0) appendRootDetailsBlock(ul, rootRows, folderOpts, folderGroups);
}

function formatTimerRemain(ms) {
  if (ms <= 0) return "0:00";
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${s}s`;
}

function clearQuizTimerVisual() {
  if (quizTimerIntervalId) {
    clearInterval(quizTimerIntervalId);
    quizTimerIntervalId = null;
  }
  const el = $("quiz-timer");
  if (el) {
    el.hidden = true;
    el.textContent = "";
    el.classList.remove("quiz-timer--warn", "quiz-timer--expired");
  }
}

function updateQuizTimerLabel() {
  const el = $("quiz-timer");
  if (!el || sessionTimerMode === "off") return;
  const deadline = sessionTimerMode === "question" ? questionDeadlineMs : quizWideDeadlineMs;
  const left = deadline - Date.now();
  const prefix = sessionTimerMode === "question" ? "Domanda" : "Quiz";
  if (left <= 0) {
    el.textContent = `${prefix} · 0:00`;
    el.classList.add("quiz-timer--expired");
    el.classList.remove("quiz-timer--warn");
    return;
  }
  el.classList.remove("quiz-timer--expired");
  if (left < 10000) el.classList.add("quiz-timer--warn");
  else el.classList.remove("quiz-timer--warn");
  el.textContent = `${prefix} · ${formatTimerRemain(left)}`;
}

function beginQuizTimerForCurrentQuestion() {
  clearQuizTimerVisual();
  if (sessionTimerMode === "off") return;
  if (sessionTimerMode === "question") {
    questionDeadlineMs = Date.now() + sessionTimerSeconds * 1000;
  } else {
    if (!quizWideTimerStarted) {
      quizWideTimerStarted = true;
      quizWideDeadlineMs = Date.now() + sessionTimerSeconds * 1000;
    }
  }
  const el = $("quiz-timer");
  if (el) el.hidden = false;
  quizTimerIntervalId = setInterval(updateQuizTimerLabel, 250);
  updateQuizTimerLabel();
}

function readTimerFromUI() {
  const on = $("chk-timer")?.checked;
  const modeEl = $("timer-mode");
  const secEl = $("timer-seconds");
  if (!on) return { mode: /** @type {"off"} */ ("off"), seconds: 60 };
  const mode = modeEl?.value === "quiz" ? /** @type {"quiz"} */ ("quiz") : /** @type {"question"} */ ("question");
  const sec = Math.max(15, Math.min(7200, Number(secEl?.value) || 60));
  return { mode, seconds: sec };
}

function applySessionTimerForNewQuiz() {
  const t = readTimerFromUI();
  sessionTimerMode = t.mode;
  sessionTimerSeconds = t.seconds;
  quizWideTimerStarted = false;
}

function setTimerInputsEnabled(on) {
  const m = $("timer-mode");
  const s = $("timer-seconds");
  if (m) m.disabled = !on;
  if (s) s.disabled = !on;
}

function updateTimerSecondsLabel() {
  const mode = $("timer-mode")?.value;
  const lab = $("timer-seconds-label");
  if (lab) lab.textContent = mode === "quiz" ? "Secondi totali" : "Secondi / domanda";
}

function loadQuizPrefs() {
  try {
    if (localStorage.getItem(PREF_SHUFFLE) === "1") {
      const c = $("chk-shuffle");
      if (c) c.checked = true;
    }
    if (localStorage.getItem(PREF_EXAM) === "1") {
      const ex = $("chk-exam");
      if (ex) ex.checked = true;
    }
    if (localStorage.getItem(PREF_TIMER_ON) === "1") {
      const ct = $("chk-timer");
      if (ct) ct.checked = true;
    }
    const tm = localStorage.getItem(PREF_TIMER_MODE);
    const sel = $("timer-mode");
    if (sel && (tm === "question" || tm === "quiz")) sel.value = tm;
    const ts = localStorage.getItem(PREF_TIMER_SEC);
    const num = $("timer-seconds");
    if (num && ts) {
      const n = parseInt(ts, 10);
      if (!Number.isNaN(n)) num.value = String(Math.max(15, Math.min(7200, n)));
    }
  } catch (e) {}
  const on = $("chk-timer")?.checked ?? false;
  setTimerInputsEnabled(on);
  updateTimerSecondsLabel();
}

function saveQuizPrefs() {
  try {
    localStorage.setItem(PREF_SHUFFLE, $("chk-shuffle")?.checked ? "1" : "0");
    localStorage.setItem(PREF_TIMER_ON, $("chk-timer")?.checked ? "1" : "0");
    localStorage.setItem(PREF_TIMER_MODE, $("timer-mode")?.value || "question");
    localStorage.setItem(PREF_TIMER_SEC, String($("timer-seconds")?.value || "60"));
    localStorage.setItem(PREF_EXAM, $("chk-exam")?.checked ? "1" : "0");
  } catch (e) {}
}

function buildResultsSummaryText() {
  const score = ($("results-score")?.textContent || "").trim();
  const detail = ($("results-detail")?.textContent || "").trim();
  const lines = ["Quiz.ai — Riepilogo", "", score, detail, ""];
  if (!$("wrong-list")?.hidden && wrongBank.length > 0) {
    lines.push("Domande da ripassare:");
    wrongBank.forEach((q, i) => {
      lines.push(`${i + 1}. ${(q.stem || "").trim()}`);
      const opt = q.options[q.correct];
      lines.push(`   Risposta corretta: ${q.correct}) ${opt || ""}`);
      lines.push("");
    });
  }
  return lines.join("\n");
}

/**
 * @param {KeyboardEvent} e
 */
function onQuizKeyboardShortcut(e) {
  if ($("panel-quiz").hidden) return;
  const modal = $("auth-modal");
  if (modal && !modal.hidden) return;
  const t = e.target;
  if (t instanceof HTMLTextAreaElement && t.id === "arg-text") return;

  if (e.key === "Enter") {
    if (t instanceof HTMLButtonElement || t instanceof HTMLAnchorElement) return;
    if (studyFormat === "fill_open" && t instanceof HTMLInputElement && t.id === "fill-open-input") {
      e.preventDefault();
      handleFillOpenConfirm();
      return;
    }
    if (studyFormat === "fill_bank") {
      const bb = $("btn-fill-bank-confirm");
      if (bb && !bb.disabled) {
        e.preventDefault();
        bb.click();
      }
      return;
    }
    if (studyFormat === "flash") {
      e.preventDefault();
      if (!flashShowBack) handleFlashShow();
      else handleFlashRate(true);
      return;
    }
    if (studyFormat !== "mcq") return;
    const sub = $("btn-submit");
    if (sub && !sub.disabled) {
      e.preventDefault();
      sub.click();
    }
    return;
  }

  if (studyFormat !== "mcq") return;
  if (answered) return;

  const map = { "1": "A", "2": "B", "3": "C", "4": "D" };
  let k = map[e.key];
  if (!k && e.key.length === 1 && /[a-d]/i.test(e.key)) k = e.key.toUpperCase();
  if (!k || !["A", "B", "C", "D"].includes(k)) return;
  e.preventDefault();
  const btn = $("options")?.querySelector(`.option[data-key="${k}"]`);
  if (btn instanceof HTMLButtonElement && !btn.disabled) btn.click();
}

function showPanel(name) {
  if (name === "input" || name === "results") clearQuizTimerVisual();
  $("panel-input").hidden = name !== "input";
  $("panel-quiz").hidden = name !== "quiz";
  $("panel-results").hidden = name !== "results";
  updateResumeBanner();
  syncQuizCloudSaveButton();
}

function resetMatchStudyState() {
  matchBatchStart = 0;
  matchPairedSi = new Set();
  matchPickLeftSi = null;
  matchErrorsBySi = {};
  matchCumulativePaired = 0;
}

function syncQuizBodies(mode) {
  const map = {
    mcq: "quiz-body-mcq",
    fill_bank: "quiz-body-fill-bank",
    fill_open: "quiz-body-fill-open",
    match: "quiz-body-match",
    flash: "quiz-body-flash",
  };
  Object.entries(map).forEach(([k, id]) => {
    const el = $(id);
    if (el) el.hidden = k !== mode;
  });
  const kh = $("quiz-keyboard-hint");
  if (kh) kh.hidden = mode !== "mcq";
}

function setProgress() {
  const total = activeQuiz.length || 1;
  let n = 0;
  let label = "";
  if (studyFormat === "match") {
    n = Math.min(matchCumulativePaired, total);
    label = `${n} / ${total} abbinamenti`;
  } else if (studyFormat === "flash") {
    n = flashShowBack ? index + 1 : index;
    label = `Flashcard ${Math.min(index + 1, total)} / ${total}`;
  } else if (studyFormat === "mcq") {
    n = Math.min(index + (answered ? 1 : 0), total);
    label = `${n} / ${total}`;
  } else {
    n = Math.min(index + (answered ? 1 : 0), total);
    label = `${n} / ${total}`;
  }
  const pct = Math.round((n / total) * 100);
  $("progress-fill").style.width = `${pct}%`;
  $("progress-label").textContent = label;
  const bar = $("progress-bar");
  if (bar) bar.setAttribute("aria-valuenow", String(pct));
}

function readStudyFormatFromUI() {
  const v = $("study-format")?.value;
  if (v === "fill_bank" || v === "fill_open" || v === "match" || v === "flash") return v;
  return "mcq";
}

function setFillBankStemEl(el, stem, blanked) {
  if (!el) return;
  el.replaceChildren();
  if (!blanked) {
    el.textContent = stem;
    return;
  }
  const parts = blanked.split("_____");
  parts.forEach((part, i) => {
    el.appendChild(document.createTextNode(part));
    if (i < parts.length - 1) {
      const span = document.createElement("span");
      span.className = "blank-slot";
      span.textContent = " … ";
      el.appendChild(span);
    }
  });
}

function renderFillBank() {
  if (!StudyModeUtils) return;
  const q = activeQuiz[index];
  if (!q) return;
  syncQuizBodies("fill_bank");
  clearQuizTimerVisual();
  const meta = $("fill-bank-meta");
  if (meta) {
    meta.textContent = examMode
      ? `Completamento · ${index + 1} di ${activeQuiz.length} · esame`
      : `Completamento · ${index + 1} di ${activeQuiz.length}`;
  }
  const correctText = q.options[q.correct];
  const blanked = StudyModeUtils.tryStemBlank(q.stem, correctText);
  setFillBankStemEl($("fill-bank-stem"), q.stem, blanked);
  const chips = $("fill-bank-chips");
  if (!chips) return;
  chips.replaceChildren();
  fillBankSelectedKey = null;
  answered = false;
  const keys = StudyModeUtils.shuffleArray(["A", "B", "C", "D"]);
  keys.forEach((k) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "study-chip";
    btn.dataset.key = k;
    btn.textContent = q.options[k];
    btn.addEventListener("click", () => {
      if (answered) return;
      fillBankSelectedKey = k;
      chips.querySelectorAll(".study-chip").forEach((c) => c.classList.remove("study-chip--selected"));
      btn.classList.add("study-chip--selected");
      const cbtn = $("btn-fill-bank-confirm");
      if (cbtn) cbtn.disabled = false;
    });
    chips.appendChild(btn);
  });
  const fb = $("fill-bank-feedback");
  if (fb) {
    fb.hidden = true;
    fb.textContent = "";
    fb.className = "feedback";
  }
  const cbtn = $("btn-fill-bank-confirm");
  if (cbtn) {
    cbtn.disabled = true;
    cbtn.textContent = "Conferma";
  }
  setProgress();
  beginQuizTimerForCurrentQuestion();
}

function handleFillBankConfirm() {
  const q = activeQuiz[index];
  const chips = $("fill-bank-chips");
  const fb = $("fill-bank-feedback");
  const cbtn = $("btn-fill-bank-confirm");
  if (!q || !fillBankSelectedKey) return;
  if (!answered) {
    const ok = fillBankSelectedKey === q.correct;
    if (!ok) pushWrong(q);
    answered = true;
    if (fb) {
      fb.hidden = false;
      if (examMode) {
        fb.className = "feedback feedback-exam";
        fb.textContent = "Risposta registrata. Esito completo a fine sessione.";
      } else {
        fb.className = `feedback ${ok ? "ok" : "bad"}`;
        fb.innerHTML = ok
          ? `<strong>Giusto.</strong> (${q.correct}) ${escapeHtml(q.options[q.correct])}`
          : `<strong>Sbagliato.</strong> Era <strong>${q.correct}</strong>: ${escapeHtml(q.options[q.correct])}`;
      }
    }
    if (chips) {
      chips.querySelectorAll(".study-chip").forEach((b) => {
        b.disabled = true;
        if (!examMode && b.dataset.key === q.correct) b.classList.add("study-chip--correct");
        if (!examMode && b.dataset.key === fillBankSelectedKey && !ok) b.classList.add("study-chip--wrong");
      });
    }
    if (cbtn) {
      cbtn.disabled = false;
      cbtn.textContent =
        index < activeQuiz.length - 1 ? "Continua" : isReviewMode ? "Termina ripasso" : "Vedi risultati";
    }
    setProgress();
    saveSessionSoon();
    return;
  }
  if (index < activeQuiz.length - 1) {
    index += 1;
    renderFillBank();
  } else if (isReviewMode) {
    finishReview();
  } else {
    finishQuiz();
  }
  saveSessionSoon();
}

function renderFillOpen() {
  const q = activeQuiz[index];
  if (!q) return;
  syncQuizBodies("fill_open");
  clearQuizTimerVisual();
  const meta = $("fill-open-meta");
  if (meta) {
    meta.textContent = examMode
      ? `Scrivi la risposta · ${index + 1} di ${activeQuiz.length} · esame`
      : `Scrivi la risposta · ${index + 1} di ${activeQuiz.length}`;
  }
  const stem = $("fill-open-stem");
  if (stem) stem.textContent = q.stem;
  const inp = $("fill-open-input");
  if (inp) {
    inp.value = "";
    inp.disabled = false;
  }
  answered = false;
  const fb = $("fill-open-feedback");
  if (fb) {
    fb.hidden = true;
    fb.textContent = "";
    fb.className = "feedback";
  }
  const cbtn = $("btn-fill-open-confirm");
  if (cbtn) cbtn.textContent = "Conferma";
  setProgress();
  beginQuizTimerForCurrentQuestion();
}

function handleFillOpenConfirm() {
  const q = activeQuiz[index];
  if (!q || !StudyModeUtils) return;
  const inp = $("fill-open-input");
  const fb = $("fill-open-feedback");
  const cbtn = $("btn-fill-open-confirm");
  if (!answered) {
    const raw = (inp?.value || "").trim();
    if (!raw) return;
    const ok = StudyModeUtils.openAnswersMatch(raw, q.options[q.correct]);
    if (!ok) pushWrong(q);
    answered = true;
    if (inp) inp.disabled = true;
    if (fb) {
      fb.hidden = false;
      if (examMode) {
        fb.className = "feedback feedback-exam";
        fb.textContent = "Risposta registrata. Esito completo a fine sessione.";
      } else {
        fb.className = `feedback ${ok ? "ok" : "bad"}`;
        fb.innerHTML = ok
          ? `<strong>Corretto.</strong> (${q.correct}) ${escapeHtml(q.options[q.correct])}`
          : `<strong>Non coincide.</strong> Atteso: <strong>${q.correct}</strong> — ${escapeHtml(q.options[q.correct])}`;
      }
    }
    if (cbtn) {
      cbtn.textContent =
        index < activeQuiz.length - 1 ? "Continua" : isReviewMode ? "Termina ripasso" : "Vedi risultati";
    }
    setProgress();
    saveSessionSoon();
    return;
  }
  if (index < activeQuiz.length - 1) {
    index += 1;
    renderFillOpen();
  } else if (isReviewMode) {
    finishReview();
  } else {
    finishQuiz();
  }
  saveSessionSoon();
}

function renderMatchRound() {
  syncQuizBodies("match");
  clearQuizTimerVisual();
  const batch = activeQuiz.slice(matchBatchStart, matchBatchStart + MATCH_BATCH);
  if (batch.length === 0) {
    if (isReviewMode) finishReview();
    else finishQuiz();
    return;
  }
  matchPairedSi = new Set();
  matchPickLeftSi = null;
  matchErrorsBySi = {};
  batch.forEach((qq) => {
    matchErrorsBySi[qq.sourceIndex] = 0;
  });
  const meta = $("match-meta");
  if (meta) {
    meta.textContent = `Abbina · gruppo ${Math.floor(matchBatchStart / MATCH_BATCH) + 1} · ${batch.length} coppie`;
  }
  const leftEl = $("match-col-left");
  const rightEl = $("match-col-right");
  if (!leftEl || !rightEl) return;
  leftEl.replaceChildren();
  rightEl.replaceChildren();
  const rights = StudyModeUtils.shuffleArray(
    batch.map((qq) => ({ si: qq.sourceIndex, text: qq.options[qq.correct] }))
  );
  batch.forEach((qq) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "match-tile match-tile-left";
    btn.dataset.si = String(qq.sourceIndex);
    const oneLine = qq.stem.replace(/\s+/g, " ").trim();
    const short = oneLine.slice(0, 140);
    btn.textContent = short.length < oneLine.length ? `${short}…` : short;
    btn.addEventListener("click", () => onMatchPickLeft(qq.sourceIndex));
    leftEl.appendChild(btn);
  });
  rights.forEach(({ si, text }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "match-tile match-tile-right";
    btn.dataset.si = String(si);
    btn.textContent = text;
    btn.addEventListener("click", () => onMatchPickRight(si));
    rightEl.appendChild(btn);
  });
  const mfb = $("match-feedback");
  if (mfb) mfb.hidden = true;
  setProgress();
  beginQuizTimerForCurrentQuestion();
}

function onMatchPickLeft(si) {
  if (matchPairedSi.has(si)) return;
  matchPickLeftSi = si;
  $("match-col-left")?.querySelectorAll(".match-tile-left").forEach((b) => {
    b.classList.toggle("match-tile--picked", Number(b.dataset.si) === si);
  });
}

function onMatchPickRight(siR) {
  if (matchPickLeftSi === null) return;
  if (matchPairedSi.has(siR)) return;
  const siL = matchPickLeftSi;
  const fb = $("match-feedback");
  const batch = activeQuiz.slice(matchBatchStart, matchBatchStart + MATCH_BATCH);
  if (siL === siR) {
    matchPairedSi.add(siL);
    matchCumulativePaired += 1;
    matchPickLeftSi = null;
    $("match-col-left")?.querySelectorAll(".match-tile-left").forEach((b) => {
      const s = Number(b.dataset.si);
      b.classList.remove("match-tile--picked");
      if (s === siL) {
        b.classList.add("match-tile--paired");
        b.disabled = true;
      }
    });
    $("match-col-right")?.querySelectorAll(".match-tile-right").forEach((b) => {
      if (Number(b.dataset.si) === siR) {
        b.classList.add("match-tile--paired");
        b.disabled = true;
      }
    });
    if (fb) fb.hidden = true;
    setProgress();
    saveSessionSoon();
    if (matchPairedSi.size >= batch.length) {
      batch.forEach((qq) => {
        if ((matchErrorsBySi[qq.sourceIndex] || 0) > 0) pushWrong(qq);
      });
      matchBatchStart += batch.length;
      if (matchBatchStart >= activeQuiz.length) {
        if (isReviewMode) finishReview();
        else finishQuiz();
      } else {
        renderMatchRound();
      }
    }
  } else {
    matchErrorsBySi[siL] = (matchErrorsBySi[siL] || 0) + 1;
    matchPickLeftSi = null;
    $("match-col-left")?.querySelectorAll(".match-tile-left").forEach((b) => b.classList.remove("match-tile--picked"));
    if (fb) {
      fb.hidden = false;
      fb.className = "feedback bad";
      fb.textContent = "Non corrisponde: scegli un’altra risposta a destra.";
    }
    saveSessionSoon();
  }
}

function renderFlashcard() {
  const q = activeQuiz[index];
  if (!q) return;
  syncQuizBodies("flash");
  clearQuizTimerVisual();
  flashShowBack = false;
  const fm = $("flash-meta");
  if (fm) fm.textContent = `Flashcard ${index + 1} di ${activeQuiz.length}`;
  const fr = $("flash-front");
  if (fr) {
    fr.hidden = false;
    fr.textContent = q.stem;
  }
  const bk = $("flash-back");
  if (bk) bk.hidden = true;
  const bt = $("flash-back-text");
  if (bt) bt.textContent = `${q.correct}) ${q.options[q.correct]}`;
  const hh = $("flash-back-hint");
  if (hh) {
    if (q.hint) {
      hh.hidden = false;
      hh.textContent = q.hint;
    } else {
      hh.hidden = true;
      hh.textContent = "";
    }
  }
  const fShow = $("flash-btn-show");
  if (fShow) fShow.hidden = false;
  const fForgot = $("flash-btn-forgot");
  if (fForgot) fForgot.hidden = true;
  const fKnew = $("flash-btn-knew");
  if (fKnew) fKnew.hidden = true;
  setProgress();
  beginQuizTimerForCurrentQuestion();
}

function handleFlashShow() {
  flashShowBack = true;
  const fr = $("flash-front");
  if (fr) fr.hidden = true;
  const bk = $("flash-back");
  if (bk) bk.hidden = false;
  const sh = $("flash-btn-show");
  if (sh) sh.hidden = true;
  const fo = $("flash-btn-forgot");
  if (fo) fo.hidden = false;
  const kn = $("flash-btn-knew");
  if (kn) kn.hidden = false;
  setProgress();
  saveSessionSoon();
}

function handleFlashRate(knew) {
  const q = activeQuiz[index];
  if (!knew && q) pushWrong(q);
  index += 1;
  flashShowBack = false;
  if (index >= activeQuiz.length) {
    if (isReviewMode) finishReview();
    else finishQuiz();
  } else {
    renderFlashcard();
  }
  saveSessionSoon();
}

function beginStudyAfterStart() {
  studyFormat = readStudyFormatFromUI();
  $("btn-submit").textContent = "Conferma risposta";
  if (studyFormat === "mcq") {
    syncQuizBodies("mcq");
    renderQuestion();
  } else {
    index = 0;
    answered = false;
    fillBankSelectedKey = null;
    flashShowBack = false;
    resetMatchStudyState();
    if (!StudyModeUtils) {
      studyFormat = "mcq";
      syncQuizBodies("mcq");
      renderQuestion();
      saveSessionSoon();
      return;
    }
    if (studyFormat === "fill_bank") renderFillBank();
    else if (studyFormat === "fill_open") renderFillOpen();
    else if (studyFormat === "match") renderMatchRound();
    else renderFlashcard();
  }
  saveSessionSoon();
}

/**
 * @param {{ answered: boolean, selected: string, argText: string, hintVisible: boolean } | undefined} restore
 */
function renderQuestion(restore) {
  const q = activeQuiz[index];
  if (!q) return;

  syncQuizBodies("mcq");

  if (!restore || !restore.answered) {
    selected = null;
    answered = false;
  }

  const baseMeta = isReviewMode
    ? `Ripasso · domanda ${index + 1} di ${activeQuiz.length}`
    : `Domanda ${index + 1} di ${activeQuiz.length}`;
  $("question-meta").textContent = examMode ? `${baseMeta} · modalità esame` : baseMeta;

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
    clearQuizTimerVisual();
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
  $("btn-hint").hidden = examMode || !q.hint;
  $("btn-hint").textContent = "Mostra suggerimento";

  setProgress();
  beginQuizTimerForCurrentQuestion();
}

function argomentazioneFeedback(ok, argText) {
  const t = argText.trim();
  if (!t) return "";
  if (t.length < 15) return "Hai aggiunto un'argomentazione breve: va bene per un ripasso veloce.";
  if (ok) return "Argomentazione presente: ottimo per fissare i concetti a voce.";
  return "Anche con un'argomentazione, la lettera corretta è un'altra: confronta con il suggerimento o il libro.";
}

/**
 * @param {(typeof fullQuiz)[0]} q
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
    if (examMode) {
      if (k === selectedKey) el.classList.add("selected");
    } else {
      if (k === q.correct) el.classList.add("correct-reveal");
      if (k === selectedKey && k !== q.correct) el.classList.add("wrong-reveal");
      if (k === selectedKey) el.classList.add("selected");
    }
  });

  const fb = $("feedback");
  fb.hidden = false;
  if (examMode) {
    fb.className = "feedback feedback-exam";
    fb.textContent =
      "Risposta registrata. In modalità esame non viene mostrato se è corretta: il riepilogo completo è a fine quiz.";
  } else {
    fb.className = `feedback ${ok ? "ok" : "bad"}`;
    const argFb = argomentazioneFeedback(ok, argText);
    if (ok) {
      fb.innerHTML = `<strong>Esatto.</strong> La risposta corretta è ${q.correct}.${argFb ? `<br/><span class="muted-inline">${escapeHtml(argFb)}</span>` : ""}`;
    } else {
      fb.innerHTML = `<strong>Sbagliato.</strong> La risposta corretta è <strong>${q.correct}</strong>: ${escapeHtml(q.options[q.correct])}.${argFb ? `<br/><span class="muted-inline">${escapeHtml(argFb)}</span>` : ""}`;
    }
  }

  $("btn-submit").textContent =
    index < activeQuiz.length - 1 ? "Continua" : isReviewMode ? "Termina ripasso" : "Vedi risultati";
  $("btn-submit").disabled = false;

  if (examMode) {
    $("hint-box").hidden = true;
    $("btn-hint").hidden = true;
  } else if (hintVisible && q.hint) {
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

async function recordQuizAttempt(correctCount, totalCount, isReview) {
  const sb = getSupabase();
  if (!sb) return;
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) return;
  const ctx = attemptContext;
  let folderId = ctx?.folderId || null;
  const savedQuizId = ctx?.savedQuizId || null;
  if (!folderId && savedQuizId) {
    const { data: row } = await sb.from("saved_quizzes").select("folder_id").eq("id", savedQuizId).maybeSingle();
    if (row?.folder_id) folderId = row.folder_id;
  }
  const { error } = await sb.from("quiz_attempts").insert({
    user_id: session.user.id,
    folder_id: folderId,
    saved_quiz_id: savedQuizId,
    correct_count: correctCount,
    total_count: totalCount,
    review_mode: isReview,
    exam_mode: examMode,
  });
  if (error) console.warn("quiz_attempts insert:", error.message);
}

function fillWrongList(items) {
  const wi = $("wrong-items");
  wi.innerHTML = "";
  items.forEach((q) => {
    const li = document.createElement("li");
    li.className = "wrong-item";
    const stemEl = document.createElement("p");
    stemEl.className = "wrong-item-stem";
    stemEl.textContent = (q.stem || "").trim();
    const ansEl = document.createElement("p");
    ansEl.className = "wrong-item-correct";
    const letter = q.correct;
    const optText = q.options[letter] || "";
    ansEl.innerHTML = `<strong>Risposta corretta:</strong> ${escapeHtml(letter)}) ${escapeHtml(optText)}`;
    li.appendChild(stemEl);
    li.appendChild(ansEl);
    wi.appendChild(li);
  });
}

function finishQuiz() {
  const total = fullQuiz.length;
  const wrongCount = wrongBank.length;
  const right = total - wrongCount;
  void recordQuizAttempt(right, total, false);
  showPanel("results");
  $("results-score").textContent = `${right} / ${total} corrette`;
  let detail =
    wrongCount === 0
      ? "Ottimo lavoro: nessun errore da ripassare."
      : `${wrongCount} domanda/e da ripassare. Puoi rifare solo quelle sbagliate.`;
  if (examMode) {
    detail +=
      " Modalità esame: durante il quiz non vedevi esiti immediati sulla singola domanda né suggerimenti.";
  }
  $("results-detail").textContent = detail;

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
  const total = Math.max(1, reviewSessionTotal || activeQuiz.length);
  const still = wrongBank.length;
  const right = Math.max(0, total - still);
  void recordQuizAttempt(right, total, true);
  showPanel("results");
  $("results-score").textContent = "Ripasso completato";
  let detail =
    still === 0
      ? "Hai risposto bene a tutte le domande del ripasso."
      : `Nel ripasso, ${still} domanda/e sono ancora errate. Puoi ripetere il ripasso su quelle.`;
  if (examMode) {
    detail +=
      " Modalità esame: durante il ripasso non vedevi esiti immediati sulla singola domanda né suggerimenti.";
  }
  $("results-detail").textContent = detail;

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

/**
 * @param {string} text
 * @param {{ id: string, folderId?: string | null } | null} [historyEntry]
 */
function startFromText(text, historyEntry) {
  const parsed = parseQuizText(text);
  if (parsed.length === 0) {
    $("parse-error").hidden = false;
    $("parse-error").textContent =
      "Non ho trovato domande valide. La domanda può essere «1. …» o in Markdown «### **1. …**»; servono «A) …» … «D) …» e «Risposta: X» o «✅ **Risposta: X**». Righe «---» sono ignorate. Opzionale: «💡 Suggerimento: …» dopo la risposta.";
    return;
  }
  $("parse-error").hidden = true;
  applySessionTimerForNewQuiz();
  attemptContext =
    historyEntry && historyEntry.id
      ? { savedQuizId: historyEntry.id, folderId: historyEntry.folderId || null }
      : null;
  examMode = !!$("chk-exam")?.checked;
  reviewSessionTotal = 0;
  savedRawText = text;
  fullQuiz = parsed;
  activeQuiz = parsed.slice();
  if ($("chk-shuffle")?.checked) activeQuiz = shuffle(activeQuiz);
  wrongBank = [];
  index = 0;
  isReviewMode = false;
  selected = null;
  answered = false;
  showPanel("quiz");
  beginStudyAfterStart();
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

  Q.initQuizApp = function initQuizApp() {
  loadQuizPrefs();
  $("chk-shuffle")?.addEventListener("change", saveQuizPrefs);
  $("chk-timer")?.addEventListener("change", () => {
    setTimerInputsEnabled(!!$("chk-timer")?.checked);
    saveQuizPrefs();
  });
  $("timer-mode")?.addEventListener("change", () => {
    updateTimerSecondsLabel();
    saveQuizPrefs();
  });
  $("timer-seconds")?.addEventListener("change", saveQuizPrefs);
  $("chk-exam")?.addEventListener("change", saveQuizPrefs);
  document.addEventListener("keydown", onQuizKeyboardShortcut);

  $("btn-parse").addEventListener("click", () => {
    startFromText($("raw-text").value);
  });

  $("study-format")?.addEventListener("change", () => {
    const ta = $("raw-text");
    if (ta) ta.value = getStudyFormatSampleText();
  });

  $("btn-sample").addEventListener("click", () => {
    const t = getStudyFormatSampleText();
    $("raw-text").value = t;
    startFromText(t);
  });

  $("btn-reset").addEventListener("click", () => {
    abandonSession();
  });

  $("btn-resume").addEventListener("click", () => {
    const raw = loadStoredProgress();
    if (!raw) return;
    try {
      const p = JSON.parse(raw);
      if (isSupportedStorageVersion(p.v) && Array.isArray(p.fullQuiz) && p.fullQuiz.length > 0) {
        restoreFromPayload(p);
      }
    } catch (e) {}
  });

  $("btn-discard-progress").addEventListener("click", () => {
    clearStoredProgress();
    updateResumeBanner();
  });

  $("btn-submit").addEventListener("click", () => {
    if (studyFormat !== "mcq") return;
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
    applySessionTimerForNewQuiz();
    examMode = !!$("chk-exam")?.checked;
    reviewSessionTotal = wrongBank.length;
    activeQuiz = shuffle(wrongBank.map((q) => ({ ...q })));
    index = 0;
    isReviewMode = true;
    wrongBank = [];
    showPanel("quiz");
    beginStudyAfterStart();
  });

  $("btn-results-home").addEventListener("click", () => {
    abandonSession();
  });

  $("btn-retry-all").addEventListener("click", () => {
    applySessionTimerForNewQuiz();
    examMode = !!$("chk-exam")?.checked;
    reviewSessionTotal = 0;
    activeQuiz = fullQuiz.slice();
    if ($("chk-shuffle")?.checked) activeQuiz = shuffle(activeQuiz);
    index = 0;
    wrongBank = [];
    isReviewMode = false;
    showPanel("quiz");
    beginStudyAfterStart();
  });

  $("btn-fill-bank-confirm")?.addEventListener("click", () => handleFillBankConfirm());
  $("btn-fill-open-confirm")?.addEventListener("click", () => handleFillOpenConfirm());
  $("flash-btn-show")?.addEventListener("click", () => handleFlashShow());
  $("flash-btn-forgot")?.addEventListener("click", () => handleFlashRate(false));
  $("flash-btn-knew")?.addEventListener("click", () => handleFlashRate(true));

  $("btn-save-history").addEventListener("click", async () => {
    const raw = (savedRawText || $("raw-text").value || "").trim();
    if (!raw) return;
    await addHistoryEntry(raw);
  });

  window.addEventListener("quiz-auth-changed", () => {
    void renderHistoryList();
    syncQuizCloudSaveButton();
  });

  $("btn-save-quiz-cloud")?.addEventListener("click", () => {
    void saveCurrentQuizToCloudFromPanel();
  });

  $("btn-new-folder")?.addEventListener("click", async () => {
    const n = promptRename("Nome della nuova cartella:", "");
    if (n) await createDbFolder(n);
  });

  $("btn-history-import")?.addEventListener("click", () => {
    $("history-import-input")?.click();
  });

  $("history-import-input")?.addEventListener("change", async (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    const f = input.files?.[0];
    if (!f) return;
    hideHistorySaveError();
    try {
      const text = await f.text();
      if (Q.QuizBackup) {
        await Q.QuizBackup.importFromJsonString(text, {
          showHistorySaveError,
          hideHistorySaveError,
          showHistoryImportOk,
          renderHistoryList,
        });
      } else {
        showHistorySaveError("Modulo backup non caricato.");
      }
    } catch (err) {
      showHistorySaveError("Impossibile leggere il file.");
    }
    input.value = "";
  });

  function wireExportAll(id, fmt) {
    $(id)?.addEventListener("click", async () => {
      hideHistorySaveError();
      if (!Q.QuizBackup) {
        showHistorySaveError("Modulo backup non caricato.");
        return;
      }
      const ok = await Q.QuizBackup.downloadFullBackup(fmt);
      if (!ok) showHistorySaveError("Accedi e assicurati che Supabase sia configurato per esportare.");
      else showHistoryImportOk("Download avviato.");
    });
  }
  wireExportAll("btn-export-all-json", "json");
  wireExportAll("btn-export-all-txt", "txt");
  wireExportAll("btn-export-all-md", "md");

  try {
    localStorage.removeItem("quiz-ai-history");
  } catch (e) {}

  const llmPromptCard = document.querySelector(".llm-prompt-card");
  const llmCopyFb = $("llm-copy-feedback");
  let llmCopyTimer = 0;
  function showLlmCopyFeedback() {
    if (llmCopyFb) {
      llmCopyFb.hidden = false;
      window.clearTimeout(llmCopyTimer);
      llmCopyTimer = window.setTimeout(() => {
        llmCopyFb.hidden = true;
      }, 2000);
    }
  }
  llmPromptCard?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-copy-llm-prompt-disclosure");
    if (!btn) return;
    const id = btn.getAttribute("data-llm-target");
    const ta = id ? $(id) : null;
    if (!ta) return;
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(ta.value);
    } catch (err) {
      ta.focus();
      ta.select();
      document.execCommand("copy");
    }
    showLlmCopyFeedback();
  });

  const summaryFb = $("summary-copy-feedback");
  let summaryCopyTimer = 0;
  $("btn-copy-summary")?.addEventListener("click", async () => {
    const text = buildResultsSummaryText();
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch (err) {}
      ta.remove();
    }
    if (summaryFb) {
      summaryFb.hidden = false;
      window.clearTimeout(summaryCopyTimer);
      summaryCopyTimer = window.setTimeout(() => {
        summaryFb.hidden = true;
      }, 2000);
    }
  });

  tryRestoreOnLoad();
  if (!($("raw-text")?.value || "").trim()) {
    $("raw-text").value = getStudyFormatSampleText();
  }
  };
})(window.QuizAi);
