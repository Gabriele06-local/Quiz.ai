(function (Q) {
  const $ = Q.$;
  const getSupabase = Q.getSupabase;

  /** @type {object | null} */
  let chartInstance = null;

  /**
   * Cartella da mostrare: quella registrata sul tentativo oppure quella del quiz salvato collegato.
   * @param {{ folder_id?: string | null, saved_quiz_id?: string | null }} a
   * @param {Record<string, string | null | undefined>} savedQuizFolderId
   * @returns {string | null}
   */
  function effectiveFolderIdForAttempt(a, savedQuizFolderId) {
    if (a.folder_id) return a.folder_id;
    if (a.saved_quiz_id && savedQuizFolderId[a.saved_quiz_id]) {
      return savedQuizFolderId[a.saved_quiz_id] || null;
    }
    return null;
  }

  function readCssVar(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) {
      return fallback;
    }
  }

  /**
   * @param {{ folderKey: string, label: string, attempts: number, sumCorrect: number, sumTotal: number, lastAt: string }[]} rows
   */
  function renderChart(rows) {
    const canvas = /** @type {HTMLCanvasElement | null} */ ($("stats-chart"));
    if (!canvas || typeof Chart === "undefined") return;

    const labels = rows.map((r) => r.label);
    const data = rows.map((r) =>
      r.sumTotal > 0 ? Math.round((r.sumCorrect / r.sumTotal) * 1000) / 10 : 0,
    );
    const accent = readCssVar("--accent", "#3d9cf0");
    const border = readCssVar("--border", "rgba(128,128,128,0.2)");
    const text = readCssVar("--text", "#e8ecf1");
    const muted = readCssVar("--muted", "#8b95a8");
    const success = readCssVar("--success", "#3ecf8e");
    const danger = readCssVar("--danger", "#f07178");

    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }

    const barColors = data.map((v) => {
      if (v >= 72) return success + "66";
      if (v >= 50) return accent + "55";
      return danger + "44";
    });

    chartInstance = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "% corrette (pesato sulle domande)",
            data,
            backgroundColor: barColors,
            borderColor: accent,
            borderWidth: 1,
            borderRadius: 6,
            maxBarThickness: 28,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: readCssVar("--bg-elevated", "#141922"),
            titleColor: text,
            bodyColor: muted,
            borderColor: border,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              title(items) {
                const i = items[0]?.dataIndex;
                return i != null ? labels[i] : "";
              },
              label(ctx) {
                const i = ctx.dataIndex;
                const r = rows[i];
                if (!r) return "";
                const pct = ctx.parsed.x ?? 0;
                return `${pct}% · ${r.sumCorrect}/${r.sumTotal} risposte corrette · ${r.attempts} tentativi`;
              },
            },
          },
        },
        scales: {
          x: {
            min: 0,
            max: 100,
            title: {
              display: true,
              text: "Percentuale",
              color: muted,
              font: { size: 11 },
            },
            ticks: {
              color: muted,
              callback(v) {
                return `${v}%`;
              },
            },
            grid: { color: border },
          },
          y: {
            ticks: { color: muted },
            grid: { display: false },
          },
        },
      },
    });
  }

  /**
   * @param {{ folderKey: string, label: string, attempts: number, sumCorrect: number, sumTotal: number, lastAt: string }[]} rows
   */
  function renderFolderTable(rows) {
    const tbody = $("stats-table-body");
    const wrap = $("stats-table-wrap");
    if (!tbody || !wrap) return;
    tbody.replaceChildren();
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      const pct = r.sumTotal > 0 ? Math.round((r.sumCorrect / r.sumTotal) * 1000) / 10 : 0;
      const last = r.lastAt
        ? new Date(r.lastAt).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })
        : "—";
      const frac = `${r.sumCorrect} / ${r.sumTotal}`;
      [r.label, String(r.attempts), frac, `${pct}%`, last].forEach((text, idx) => {
        const td = document.createElement("td");
        td.textContent = text;
        if (idx === 3) {
          td.className = "stats-table-pct";
          if (pct >= 75) td.classList.add("stats-table-pct--high");
          else if (pct < 50) td.classList.add("stats-table-pct--low");
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    wrap.hidden = rows.length === 0;
  }

  /**
   * @param {object[]} attempts
   * @param {Record<string, string>} folderNames
   * @param {Record<string, string | null | undefined>} savedQuizFolderId
   */
  function renderRecentTable(attempts, folderNames, savedQuizFolderId) {
    const tbody = $("stats-recent-body");
    const wrap = $("stats-recent-wrap");
    if (!tbody || !wrap) return;
    tbody.replaceChildren();
    const slice = (attempts || []).slice(0, 20);
    slice.forEach((a) => {
      const tr = document.createElement("tr");
      const ef = effectiveFolderIdForAttempt(a, savedQuizFolderId);
      const folderLabel = !ef ? "Senza cartella" : folderNames[ef] || "Cartella (rimossa)";
      const when = a.created_at
        ? new Date(a.created_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })
        : "—";
      const c = Number(a.correct_count) || 0;
      const t = Number(a.total_count) || 1;
      const pct = Math.round((c / t) * 1000) / 10;
      const typeLabel = a.review_mode ? "Ripasso" : "Quiz intero";
      const examLabel = a.exam_mode ? "Sì" : "—";

      const td0 = document.createElement("td");
      td0.textContent = when;
      const td1 = document.createElement("td");
      td1.textContent = folderLabel;
      const td2 = document.createElement("td");
      td2.className = "stats-table-result";
      td2.innerHTML = `<span class="stats-result-n">${c}/${t}</span> <span class="stats-result-p">(${pct}%)</span>`;
      const td3 = document.createElement("td");
      const spanType = document.createElement("span");
      spanType.className = a.review_mode
        ? "stats-pill stats-pill--review"
        : "stats-pill stats-pill--quiz";
      spanType.textContent = typeLabel;
      td3.appendChild(spanType);
      const td4 = document.createElement("td");
      td4.textContent = examLabel;

      tr.append(td0, td1, td2, td3, td4);
      tbody.appendChild(tr);
    });
    wrap.hidden = slice.length === 0;
  }

  /**
   * @param {number} totalAttempts
   * @param {number} sumCorrect
   * @param {number} sumTotal
   * @param {number} folderCount
   * @param {string} lastAt
   */
  function renderKpis(totalAttempts, sumCorrect, sumTotal, folderCount, lastAt) {
    const host = $("stats-kpi");
    const section = $("stats-kpi-section");
    if (!host || !section) return;
    host.replaceChildren();
    const pct = sumTotal > 0 ? Math.round((sumCorrect / sumTotal) * 1000) / 10 : 0;
    const lastStr = lastAt
      ? new Date(lastAt).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" })
      : "—";

    const cards = [
      {
        k: "Tentativi registrati",
        v: String(totalAttempts),
        d: "Sessioni finite salvate sul cloud",
      },
      {
        k: "Precisione complessiva",
        v: `${pct}%`,
        d: `${sumCorrect} corrette su ${sumTotal} domande`,
      },
      {
        k: "Cartelle con dati",
        v: String(folderCount),
        d: "Raggruppamenti con almeno un tentativo",
      },
      { k: "Ultimo allenamento", v: lastStr, d: "Data dell’ultimo tentativo" },
    ];

    cards.forEach(({ k, v, d }) => {
      const article = document.createElement("article");
      article.className = "stats-kpi-card";
      const label = document.createElement("p");
      label.className = "stats-kpi-label";
      label.textContent = k;
      const val = document.createElement("p");
      val.className = "stats-kpi-value";
      val.textContent = v;
      const desc = document.createElement("p");
      desc.className = "stats-kpi-desc";
      desc.textContent = d;
      article.append(label, val, desc);
      host.appendChild(article);
    });
    section.hidden = false;
  }

  Q.initStatsPage = async function initStatsPage() {
    const hint = $("stats-auth-hint");
    const noData = $("stats-no-data");
    const errEl = $("stats-error");
    const chartWrap = $("stats-chart-wrap");
    const kpiSection = $("stats-kpi-section");
    const sb = getSupabase();

    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = "";
    }
    if (kpiSection) kpiSection.hidden = true;
    if ($("stats-kpi")) $("stats-kpi").replaceChildren();

    if (!sb) {
      if (hint) {
        hint.hidden = false;
        hint.textContent =
          "Configurazione Supabase assente. Apri la pagina principale con le variabili d’ambiente corrette oppure servi il sito in HTTP.";
      }
      if (noData) noData.hidden = true;
      if (chartWrap) chartWrap.hidden = true;
      $("stats-table-wrap") && ($("stats-table-wrap").hidden = true);
      $("stats-recent-wrap") && ($("stats-recent-wrap").hidden = true);
      return;
    }

    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session) {
      if (hint) {
        hint.hidden = false;
        hint.textContent =
          "Accedi dalla pagina Quiz con il tuo account, poi torna qui: le statistiche sono legate al profilo cloud.";
      }
      if (noData) noData.hidden = true;
      if (chartWrap) chartWrap.hidden = true;
      $("stats-table-wrap") && ($("stats-table-wrap").hidden = true);
      $("stats-recent-wrap") && ($("stats-recent-wrap").hidden = true);
      return;
    }

    if (hint) hint.hidden = true;

    const { data: attempts, error: e1 } = await sb
      .from("quiz_attempts")
      .select("folder_id,saved_quiz_id,correct_count,total_count,created_at,review_mode,exam_mode")
      .order("created_at", { ascending: false });

    if (e1) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent =
          e1.message ||
          "Impossibile caricare le statistiche. Verifica le policy RLS e lo schema quiz_attempts.";
      }
      if (noData) noData.hidden = true;
      if (chartWrap) chartWrap.hidden = true;
      $("stats-table-wrap") && ($("stats-table-wrap").hidden = true);
      $("stats-recent-wrap") && ($("stats-recent-wrap").hidden = true);
      return;
    }

    const { data: folders, error: e2 } = await sb.from("saved_quiz_folders").select("id,name");
    if (e2 && errEl) {
      errEl.hidden = false;
      errEl.textContent = e2.message;
    }

    /** @type {Record<string, string>} */
    const folderNames = {};
    (folders || []).forEach((f) => {
      folderNames[f.id] = f.name;
    });

    const attemptList = attempts || [];
    const savedQuizIds = [...new Set(attemptList.map((x) => x.saved_quiz_id).filter(Boolean))];
    /** @type {Record<string, string | null>} */
    const savedQuizFolderId = {};
    if (savedQuizIds.length > 0) {
      const { data: sqRows } = await sb
        .from("saved_quizzes")
        .select("id,folder_id")
        .in("id", savedQuizIds);
      (sqRows || []).forEach((row) => {
        savedQuizFolderId[row.id] = row.folder_id || null;
      });
    }

    /** @type {Record<string, { attempts: number, sumCorrect: number, sumTotal: number, lastAt: string }>} */
    const agg = {};

    let sumCorrectAll = 0;
    let sumTotalAll = 0;
    let lastAtGlobal = "";

    attemptList.forEach((a) => {
      const ef = effectiveFolderIdForAttempt(a, savedQuizFolderId);
      const key = ef || "__none__";
      if (!agg[key]) {
        agg[key] = { attempts: 0, sumCorrect: 0, sumTotal: 0, lastAt: "" };
      }
      const g = agg[key];
      g.attempts += 1;
      g.sumCorrect += a.correct_count;
      g.sumTotal += a.total_count;
      const ca = a.created_at || "";
      if (ca > g.lastAt) g.lastAt = ca;

      sumCorrectAll += a.correct_count;
      sumTotalAll += a.total_count;
      if (ca > lastAtGlobal) lastAtGlobal = ca;
    });

    const rows = Object.keys(agg).map((folderKey) => {
      const g = agg[folderKey];
      const label =
        folderKey === "__none__"
          ? "Senza cartella"
          : folderNames[folderKey] || "Cartella (rimossa)";
      return {
        folderKey,
        label,
        attempts: g.attempts,
        sumCorrect: g.sumCorrect,
        sumTotal: g.sumTotal,
        lastAt: g.lastAt,
      };
    });

    rows.sort((a, b) => b.attempts - a.attempts);

    if (rows.length === 0) {
      if (noData) {
        noData.hidden = false;
        noData.textContent =
          "Nessun tentativo ancora registrato. Completa almeno un quiz (o un ripasso) mentre sei loggato: i dati compariranno qui.";
      }
      if (chartWrap) chartWrap.hidden = true;
      $("stats-table-wrap") && ($("stats-table-wrap").hidden = true);
      $("stats-recent-wrap") && ($("stats-recent-wrap").hidden = true);
      return;
    }

    if (noData) noData.hidden = true;

    renderKpis(attemptList.length, sumCorrectAll, sumTotalAll, rows.length, lastAtGlobal);

    if (chartWrap) chartWrap.hidden = false;
    renderChart(rows);
    renderFolderTable(rows);
    renderRecentTable(attemptList, folderNames, savedQuizFolderId);
  };
})(window.QuizAi);
