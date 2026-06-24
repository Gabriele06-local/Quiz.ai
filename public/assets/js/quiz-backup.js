/**
 * Export / import backup Quiz.ai (JSON + testo / Markdown leggibile).
 */
(function (Q) {
  const parseQuizText = Q.parseQuizText;
  const stripMd = Q.stripMd;
  const getSupabase = Q.getSupabase;

  const EXPORT_VERSION = 1;

  /**
   * @param {string} s
   */
  function sanitizeFilename(s) {
    const t = (s || "quiz-ai-backup")
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
    return t.slice(0, 80) || "quiz-ai-backup";
  }

  /**
   * @param {string} name
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
   * @param {string} raw
   */
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

  /**
   * @param {string} filename
   * @param {string} mime
   * @param {string} text
   */
  function downloadString(filename, mime, text) {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  /**
   * @param {{ title?: string, rawText: string, questionCount?: number, savedAt?: string }} entry
   */
  function toExportQuiz(entry) {
    return {
      title: (entry.title || "").trim() || makeTitleFromRaw(entry.rawText || ""),
      rawText: entry.rawText || "",
      questionCount: entry.questionCount,
      savedAt: entry.savedAt,
    };
  }

  /**
   * @param {{ name: string, quizzes: ReturnType<typeof toExportQuiz>[] }} folder
   * @param {ReturnType<typeof toExportQuiz>[]} loose
   */
  function buildPayload(folderBlocks, loose) {
    return {
      quizAiExport: true,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      folders: folderBlocks.map((b) => ({
        name: b.name,
        quizzes: b.quizzes.map(toExportQuiz),
      })),
      quizzesWithoutFolder: loose.map(toExportQuiz),
    };
  }

  /**
   * @param {object} payload
   * @param {string} baseName
   */
  function downloadJson(payload, baseName) {
    downloadString(
      `${sanitizeFilename(baseName)}.json`,
      "application/json;charset=utf-8",
      JSON.stringify(payload, null, 2),
    );
  }

  /**
   * @param {object} payload
   * @param {string} baseName
   */
  function downloadTextBundle(payload, baseName) {
    let out = "";
    out += `Backup Quiz.ai — ${payload.exportedAt}\n`;
    out += `Ripristino: usa «Importa backup» con il file .json.\n`;
    out += `Questo .txt serve per leggere o copiare a mano.\n\n`;

    for (const f of payload.folders) {
      out += `\n${"=".repeat(72)}\n`;
      out += `CARTELLA: ${f.name}\n`;
      out += `${"=".repeat(72)}\n\n`;
      for (const q of f.quizzes) {
        out += `--- ${q.title} ---\n\n${q.rawText}\n\n`;
      }
    }
    if (payload.quizzesWithoutFolder.length) {
      out += `\n${"=".repeat(72)}\n`;
      out += `SENZA CARTELLA\n`;
      out += `${"=".repeat(72)}\n\n`;
      for (const q of payload.quizzesWithoutFolder) {
        out += `--- ${q.title} ---\n\n${q.rawText}\n\n`;
      }
    }
    downloadString(`${sanitizeFilename(baseName)}.txt`, "text/plain;charset=utf-8", out);
  }

  /**
   * @param {object} payload
   * @param {string} baseName
   */
  function downloadMarkdownBundle(payload, baseName) {
    let out = "";
    out += `---\n`;
    out += `title: Quiz.ai backup\n`;
    out += `exportedAt: ${payload.exportedAt}\n`;
    out += `---\n\n`;
    out += `> Importa dal file **JSON** con il pulsante «Importa backup».\n\n`;

    for (const f of payload.folders) {
      out += `\n## Cartella: ${f.name}\n\n`;
      for (const q of f.quizzes) {
        out += `### ${q.title}\n\n\`\`\`\n${q.rawText}\n\`\`\`\n\n`;
      }
    }
    if (payload.quizzesWithoutFolder.length) {
      out += `\n## Senza cartella\n\n`;
      for (const q of payload.quizzesWithoutFolder) {
        out += `### ${q.title}\n\n\`\`\`\n${q.rawText}\n\`\`\`\n\n`;
      }
    }
    downloadString(`${sanitizeFilename(baseName)}.md`, "text/markdown;charset=utf-8", out);
  }

  /**
   * @param {"json"|"txt"|"md"} format
   * @param {object} payload
   * @param {string} baseName
   */
  function downloadPayload(format, payload, baseName) {
    if (format === "json") downloadJson(payload, baseName);
    else if (format === "md") downloadMarkdownBundle(payload, baseName);
    else downloadTextBundle(payload, baseName);
  }

  /**
   * @param {{ title?: string, rawText: string, questionCount?: number, savedAt?: string }} entry
   * @param {"json"|"txt"|"md"} format
   */
  function exportSingleQuiz(entry, format) {
    const q = toExportQuiz(entry);
    const base = q.title;
    if (format === "txt") {
      downloadString(`${sanitizeFilename(base)}.txt`, "text/plain;charset=utf-8", q.rawText);
      return;
    }
    if (format === "md") {
      const md = `# ${q.title}\n\n\`\`\`\n${q.rawText}\n\`\`\`\n`;
      downloadString(`${sanitizeFilename(base)}.md`, "text/markdown;charset=utf-8", md);
      return;
    }
    const payload = buildPayload([], [entry]);
    downloadJson(payload, base);
  }

  /**
   * @param {string} folderDisplayName
   * @param {object[]} entries
   * @param {"json"|"txt"|"md"} format
   */
  function exportFolder(folderDisplayName, entries, format) {
    const payload = buildPayload([{ name: folderDisplayName, quizzes: entries }], []);
    downloadPayload(format, payload, `cartella-${folderDisplayName}`);
  }

  /**
   * @param {object[]} entries
   * @param {"json"|"txt"|"md"} format
   */
  function exportRootBlock(entries, format) {
    const payload = buildPayload([], entries);
    downloadPayload(format, payload, "quiz-senza-cartella");
  }

  /**
   * @returns {Promise<void>}
   */
  async function exportFullFromDatabase() {
    const sb = getSupabase();
    if (!sb) return null;
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session) return null;

    const { data: frows } = await sb.from("saved_quiz_folders").select("id,name").order("name");
    const { data: qrows } = await sb
      .from("saved_quizzes")
      .select("id,title,raw_text,question_count,created_at,folder_id")
      .order("created_at", { ascending: false });

    /** @type {Map<string, { name: string, entries: object[] }>} */
    const byFolder = new Map();
    (frows || []).forEach((f) => {
      byFolder.set(f.id, { name: f.name, entries: [] });
    });

    const loose = [];
    (qrows || []).forEach((row) => {
      const entry = {
        title: row.title,
        rawText: row.raw_text,
        questionCount: row.question_count,
        savedAt: row.created_at,
      };
      if (row.folder_id && byFolder.has(row.folder_id)) {
        byFolder.get(row.folder_id).entries.push(entry);
      } else if (row.folder_id) {
        loose.push(entry);
      } else {
        loose.push(entry);
      }
    });

    const folderBlocks = [];
    byFolder.forEach((v) => {
      if (v.entries.length) folderBlocks.push({ name: v.name, quizzes: v.entries });
    });
    folderBlocks.sort((a, b) => a.name.localeCompare(b.name, "it"));

    return buildPayload(folderBlocks, loose);
  }

  /**
   * @param {object} sb
   * @param {string} userId
   * @param {string} folderName
   * @param {Map<string, string>} cache
   */
  async function ensureFolderId(sb, userId, folderName, cache) {
    const trimmed = (folderName || "").trim();
    if (!trimmed) return null;
    const key = normalizeFolderKey(trimmed);
    if (cache.has(key)) return cache.get(key) || null;

    const { data: existing } = await sb.from("saved_quiz_folders").select("id,name");
    const found = (existing || []).find((r) => normalizeFolderKey(r.name) === key);
    if (found) {
      cache.set(key, found.id);
      return found.id;
    }

    const { data: ins, error } = await sb
      .from("saved_quiz_folders")
      .insert({ user_id: userId, name: trimmed })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    cache.set(key, ins.id);
    return ins.id;
  }

  /**
   * @param {object} sb
   * @param {string} userId
   * @param {ReturnType<typeof toExportQuiz>} q
   * @param {string | null} folderId
   */
  async function insertImportedQuiz(sb, userId, q, folderId) {
    const raw = (q.rawText || "").trim();
    if (!raw) return { skipped: true, reason: "vuoto" };
    const n = parseQuizText(raw).length;
    if (n === 0) return { skipped: true, reason: "nessuna domanda" };
    const title = (q.title || "").trim() || makeTitleFromRaw(raw);
    const { error } = await sb.from("saved_quizzes").insert({
      user_id: userId,
      folder_id: folderId,
      title,
      raw_text: raw,
      question_count: n,
    });
    if (error) throw new Error(error.message);
    return { skipped: false };
  }

  /**
   * @param {string} jsonText
   * @param {{ showHistorySaveError: (m: string) => void, hideHistorySaveError: () => void, showHistoryImportOk: (m: string) => void, renderHistoryList: () => Promise<void> }} ui
   * @returns {Promise<void>}
   */
  async function importFromJsonString(jsonText, ui) {
    ui.hideHistorySaveError();
    let data;
    try {
      data = JSON.parse(jsonText);
    } catch (e) {
      ui.showHistorySaveError("Il file non è un JSON valido.");
      return;
    }
    if (!data || data.quizAiExport !== true || data.version !== EXPORT_VERSION) {
      ui.showHistorySaveError(
        'Backup non riconosciuto: serve un file esportato da Quiz.ai (campo "quizAiExport": true, versione 1).',
      );
      return;
    }

    const sb = getSupabase();
    if (!sb) {
      ui.showHistorySaveError("Supabase non configurato.");
      return;
    }
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session) {
      ui.showHistorySaveError("Accedi per importare nel cloud.");
      return;
    }

    const userId = session.user.id;
    /** @type {Map<string, string>} */
    const folderCache = new Map();
    let imported = 0;
    let skipped = 0;

    try {
      for (const f of data.folders || []) {
        const fid = await ensureFolderId(sb, userId, f.name || "Import", folderCache);
        for (const q of f.quizzes || []) {
          const r = await insertImportedQuiz(sb, userId, q, fid);
          if (r.skipped) skipped += 1;
          else imported += 1;
        }
      }
      for (const q of data.quizzesWithoutFolder || []) {
        const r = await insertImportedQuiz(sb, userId, q, null);
        if (r.skipped) skipped += 1;
        else imported += 1;
      }
    } catch (e) {
      ui.showHistorySaveError(e instanceof Error ? e.message : "Import fallito.");
      return;
    }

    await ui.renderHistoryList();
    let msg = `Import completato: ${imported} quiz aggiunti.`;
    if (skipped) msg += ` Saltati: ${skipped} (vuoti o non riconosciuti).`;
    ui.showHistoryImportOk(msg);
  }

  /**
   * @param {"json"|"txt"|"md"} format
   */
  /**
   * @param {"json"|"txt"|"md"} format
   * @returns {Promise<boolean>} true se esportato
   */
  async function downloadFullBackup(format) {
    const payload = await exportFullFromDatabase();
    if (!payload) return false;
    downloadPayload(format, payload, "quiz-ai-backup-completo");
    return true;
  }

  Q.QuizBackup = {
    exportSingleQuiz,
    exportFolder,
    exportRootBlock,
    downloadFullBackup,
    importFromJsonString,
    buildPayload,
    EXPORT_VERSION,
  };
})(window.QuizAi);
