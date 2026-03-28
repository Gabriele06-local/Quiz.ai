(function (Q) {
  /** @type {import("@supabase/supabase-js").SupabaseClient | null} */
  let client = null;

  Q.getSupabase = function getSupabase() {
    const cfg = window.__QUIZ_SUPABASE__;
    if (!cfg || !cfg.url || !cfg.key) return null;
    const lib = window.supabase;
    if (!lib || typeof lib.createClient !== "function") return null;
    if (!client) {
      client = lib.createClient(cfg.url, cfg.key, {
        auth: {
          // Evita lettura sessione da hash URL (OAuth); su file:// riduce rumore in console
          detectSessionInUrl: false,
        },
      });
    }
    return client;
  };
})(window.QuizAi);
