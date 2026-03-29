(function (Q) {
  const $ = Q.$;
  const escapeHtml = Q.escapeHtml;
  const parseQuizText = Q.parseQuizText;
  const stripMd = Q.stripMd;
  const getSupabase = Q.getSupabase;

  const PROGRESS_KEY = "quiz-ai-progress";
const STORAGE_VERSION = 3;

function isSupportedStorageVersion(v) {
  return v === 2 || v === 3;
}

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

async function addHistoryEntry(rawText) {
  hideHistorySaveError();
  const sb = getSupabase();
  if (!sb) {
    showHistorySaveError("Account cloud non configurato.");
    return;
  }
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) {
    showHistorySaveError("Accedi per salvare lo storico nel database.");
    return;
  }
  const n = fullQuiz.length || parseQuizText(rawText).length;
  const title = makeTitleFromRaw(rawText);
  const { error } = await sb.from("saved_quizzes").insert({
    user_id: session.user.id,
    folder_id: null,
    title,
    raw_text: rawText,
    question_count: n,
  });
  if (error) {
    showHistorySaveError(error.message || "Salvataggio non riuscito.");
    return;
  }
  await renderHistoryList();
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

  const nested = document.createElement("ul");
  nested.className = "history-nested";
  entries.forEach((entry) => {
    nested.appendChild(buildHistoryQuizRow(entry, folderOpts, folderGroups));
  });

  details.appendChild(summary);
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
      const stem = q.stem.replace(/\s+/g, " ").trim();
      lines.push(`${i + 1}. ${stem}`);
      const opt = q.options[q.correct];
      lines.push(`   Risposta corretta: ${q.correct}) ${opt || ""}`);
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
    const sub = $("btn-submit");
    if (sub && !sub.disabled) {
      e.preventDefault();
      sub.click();
    }
    return;
  }

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
  const { error } = await sb.from("quiz_attempts").insert({
    user_id: session.user.id,
    folder_id: ctx?.folderId || null,
    saved_quiz_id: ctx?.savedQuizId || null,
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
    const short = q.stem.replace(/\n/g, " ");
    li.textContent = short.slice(0, 120) + (short.length > 120 ? "…" : "");
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
    $("btn-submit").textContent = "Conferma risposta";
    renderQuestion();
    saveSessionSoon();
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
    $("btn-submit").textContent = "Conferma risposta";
    renderQuestion();
    saveSessionSoon();
  });

  $("btn-save-history").addEventListener("click", async () => {
    const raw = (savedRawText || $("raw-text").value || "").trim();
    if (!raw) return;
    await addHistoryEntry(raw);
  });

  window.addEventListener("quiz-auth-changed", () => {
    void renderHistoryList();
  });

  $("btn-new-folder")?.addEventListener("click", async () => {
    const n = promptRename("Nome della nuova cartella:", "");
    if (n) await createDbFolder(n);
  });

  try {
    localStorage.removeItem("quiz-ai-history");
  } catch (e) {}

  const llmPromptTa = $("llm-prompt-text");
  const llmCopyFb = $("llm-copy-feedback");
  let llmCopyTimer = 0;
  $("btn-copy-llm-prompt")?.addEventListener("click", async () => {
    if (!llmPromptTa) return;
    try {
      await navigator.clipboard.writeText(llmPromptTa.value);
    } catch (e) {
      llmPromptTa.focus();
      llmPromptTa.select();
      document.execCommand("copy");
    }
    if (llmCopyFb) {
      llmCopyFb.hidden = false;
      window.clearTimeout(llmCopyTimer);
      llmCopyTimer = window.setTimeout(() => {
        llmCopyFb.hidden = true;
      }, 2000);
    }
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
  };
})(window.QuizAi);
