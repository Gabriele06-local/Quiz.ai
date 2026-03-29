(function (Q) {
  const $ = Q.$;
  const getSupabase = Q.getSupabase;

  /** @type {object | null} */
  let chartInstance = null;

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
    const data = rows.map((r) => (r.sumTotal > 0 ? Math.round((r.sumCorrect / r.sumTotal) * 1000) / 10 : 0));
    const accent = readCssVar("--accent", "#3d9cf0");
    const border = readCssVar("--border", "rgba(128,128,128,0.2)");
    const text = readCssVar("--text", "#e8ecf1");
    const muted = readCssVar("--muted", "#8b95a8");

    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }

    chartInstance = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Media % risposte corrette (pesata sui tentativi)",
            data,
            backgroundColor: accent + "55",
            borderColor: accent,
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        indexAxis: "y",
        plugins: {
          legend: {
            labels: { color: text },
          },
        },
        scales: {
          x: {
            min: 0,
            max: 100,
            ticks: { color: muted },
            grid: { color: border },
          },
          y: {
            ticks: { color: muted },
            grid: { color: border },
          },
        },
      },
    });
  }

  /**
   * @param {{ folderKey: string, label: string, attempts: number, sumCorrect: number, sumTotal: number, lastAt: string }[]} rows
   */
  function renderTable(rows) {
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
      for (const text of [r.label, String(r.attempts), `${pct}%`, last]) {
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
    wrap.hidden = rows.length === 0;
  }

  Q.initStatsPage = async function initStatsPage() {
    const hint = $("stats-auth-hint");
    const noData = $("stats-no-data");
    const errEl = $("stats-error");
    const chartWrap = $("stats-chart-wrap");
    const sb = getSupabase();

    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = "";
    }

    if (!sb) {
      if (hint) {
        hint.hidden = false;
        hint.textContent = "Configurazione Supabase assente. Apri la pagina principale con le variabili d’ambiente corrette.";
      }
      if (noData) noData.hidden = true;
      if (chartWrap) chartWrap.hidden = true;
      return;
    }

    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session) {
      if (hint) {
        hint.hidden = false;
        hint.textContent = "Accedi dalla pagina principale (Quiz) con il tuo account, poi torna qui.";
      }
      if (noData) noData.hidden = true;
      if (chartWrap) chartWrap.hidden = true;
      $("stats-table-wrap") && ($("stats-table-wrap").hidden = true);
      return;
    }

    if (hint) hint.hidden = true;

    const { data: attempts, error: e1 } = await sb
      .from("quiz_attempts")
      .select("folder_id,correct_count,total_count,created_at")
      .order("created_at", { ascending: false });

    if (e1) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = e1.message || "Impossibile caricare le statistiche. Esegui migration_quiz_attempts.sql su Supabase.";
      }
      if (noData) noData.hidden = true;
      if (chartWrap) chartWrap.hidden = true;
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

    /** @type {Record<string, { attempts: number, sumCorrect: number, sumTotal: number, lastAt: string }>} */
    const agg = {};

    (attempts || []).forEach((a) => {
      const key = a.folder_id || "__none__";
      if (!agg[key]) {
        agg[key] = { attempts: 0, sumCorrect: 0, sumTotal: 0, lastAt: "" };
      }
      const g = agg[key];
      g.attempts += 1;
      g.sumCorrect += a.correct_count;
      g.sumTotal += a.total_count;
      const ca = a.created_at || "";
      if (ca > g.lastAt) g.lastAt = ca;
    });

    const rows = Object.keys(agg).map((folderKey) => {
      const g = agg[folderKey];
      const label = folderKey === "__none__" ? "Senza cartella" : folderNames[folderKey] || "Cartella (rimossa)";
      return { folderKey, label, attempts: g.attempts, sumCorrect: g.sumCorrect, sumTotal: g.sumTotal, lastAt: g.lastAt };
    });

    rows.sort((a, b) => b.attempts - a.attempts);

    if (rows.length === 0) {
      if (noData) noData.hidden = false;
      if (chartWrap) chartWrap.hidden = true;
      $("stats-table-wrap") && ($("stats-table-wrap").hidden = true);
      return;
    }

    if (noData) noData.hidden = true;
    if (chartWrap) chartWrap.hidden = false;
    renderChart(rows);
    renderTable(rows);
  };
})(window.QuizAi);
