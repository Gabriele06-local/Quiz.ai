(function (Q) {
  const $ = Q.$;
  const getSupabase = Q.getSupabase;

  function setAuthModalMode(configured) {
    const un = $("auth-unconfigured");
    const wrap = $("auth-modal-forms-wrap");
    const title = $("auth-modal-title");
    if (un) un.hidden = configured;
    if (wrap) wrap.hidden = !configured;
    if (title) title.textContent = configured ? "Account" : "Account cloud (Supabase)";
  }

  function showAuthModal(show, opts) {
    const m = $("auth-modal");
    if (!m) return;
    m.hidden = !show;
    m.setAttribute("aria-hidden", show ? "false" : "true");
    if (show) {
      const configured = opts && opts.configured !== false;
      setAuthModalMode(configured);
      if (configured) {
        const loginActive = $("form-login")?.classList.contains("is-active");
        (loginActive ? $("auth-email-in") : $("auth-email-up"))?.focus();
      } else {
        $("auth-modal-close-setup")?.focus();
      }
    }
  }

  function setAuthError(msg) {
    const el = $("auth-error");
    if (el) el.textContent = msg || "";
  }

  function updateAuthUI(session) {
    const guest = $("auth-guest");
    const user = $("auth-user");
    const email = $("auth-email");
    const noCfg = $("auth-no-config");
    const sb = getSupabase();

    if (!sb) {
      noCfg?.setAttribute("hidden", "");
      guest?.removeAttribute("hidden");
      user?.setAttribute("hidden", "");
      return;
    }
    noCfg?.setAttribute("hidden", "");

    if (session && session.user) {
      guest?.setAttribute("hidden", "");
      user?.removeAttribute("hidden");
      if (email) {
        const em = session.user.email || "Account";
        email.textContent = em;
        email.title = em;
      }
    } else {
      user?.setAttribute("hidden", "");
      guest?.removeAttribute("hidden");
    }
  }

  function setTab(mode) {
    const loginTab = $("tab-login");
    const regTab = $("tab-register");
    const loginForm = $("form-login");
    const regForm = $("form-register");
    const isLogin = mode === "login";
    if (loginTab) loginTab.setAttribute("aria-selected", String(isLogin));
    if (regTab) regTab.setAttribute("aria-selected", String(!isLogin));
    loginForm?.classList.toggle("is-active", isLogin);
    regForm?.classList.toggle("is-active", !isLogin);
    setAuthError("");
  }

  Q.initAuth = function initAuth() {
    const sb = getSupabase();
    if (!sb) {
      updateAuthUI(null);
    } else {
      sb.auth.getSession().then(({ data }) => {
        updateAuthUI(data.session);
        window.dispatchEvent(new CustomEvent("quiz-auth-changed", { detail: { session: data.session } }));
      });
      sb.auth.onAuthStateChange((_event, session) => {
        updateAuthUI(session);
        window.dispatchEvent(new CustomEvent("quiz-auth-changed", { detail: { session } }));
      });
    }

    function openAuthModal(mode) {
      const ok = !!getSupabase();
      if (ok) {
        setTab(mode);
        showAuthModal(true, { configured: true });
      } else {
        setTab(mode);
        showAuthModal(true, { configured: false });
      }
    }

    $("btn-login")?.addEventListener("click", () => openAuthModal("login"));

    $("btn-register")?.addEventListener("click", () => openAuthModal("register"));

    $("tab-login")?.addEventListener("click", () => setTab("login"));
    $("tab-register")?.addEventListener("click", () => setTab("register"));

    $("auth-modal-close")?.addEventListener("click", () => showAuthModal(false));
    $("auth-modal-close-2")?.addEventListener("click", () => showAuthModal(false));
    $("auth-modal-close-setup")?.addEventListener("click", () => showAuthModal(false));

    $("auth-modal")?.addEventListener("click", (e) => {
      if (e.target instanceof HTMLElement && e.target.classList.contains("auth-modal-backdrop")) {
        showAuthModal(false);
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("auth-modal")?.hidden) showAuthModal(false);
    });

    $("btn-logout")?.addEventListener("click", async () => {
      const client = getSupabase();
      if (client) await client.auth.signOut();
    });

    $("form-login")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const client = getSupabase();
      if (!client) return;
      const em = /** @type {HTMLInputElement} */ ($("auth-email-in")).value.trim();
      const pw = /** @type {HTMLInputElement} */ ($("auth-password-in")).value;
      setAuthError("");
      const { error } = await client.auth.signInWithPassword({ email: em, password: pw });
      if (error) {
        setAuthError(error.message);
        return;
      }
      showAuthModal(false);
    });

    $("form-register")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const client = getSupabase();
      if (!client) return;
      const em = /** @type {HTMLInputElement} */ ($("auth-email-up")).value.trim();
      const pw = /** @type {HTMLInputElement} */ ($("auth-password-up")).value;
      const pw2 = /** @type {HTMLInputElement} */ ($("auth-password-up2")).value;
      setAuthError("");
      if (pw.length < 6) {
        setAuthError("La password deve avere almeno 6 caratteri.");
        return;
      }
      if (pw !== pw2) {
        setAuthError("Le password non coincidono.");
        return;
      }
      const { error } = await client.auth.signUp({ email: em, password: pw });
      if (error) {
        setAuthError(error.message);
        return;
      }
      setAuthError("Controlla la email per confermare l’account (se richiesto dal progetto Supabase).");
      const { data } = await client.auth.getSession();
      if (data.session) showAuthModal(false);
    });
  };
})(window.QuizAi);
