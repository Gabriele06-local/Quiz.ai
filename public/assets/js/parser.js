(function (Q) {
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

  Q.stripMd = stripMd;
  Q.parseQuizText = parseQuizText;
})(window.QuizAi);
