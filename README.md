# Quiz.ai

App web statica per studiare con quiz a scelta multipla: incolli il testo, l’app riconosce domande e risposte e ti guida domanda per domanda.

**Online:** [quizioai.netlify.app](https://quizioai.netlify.app/)

## Struttura cartelle

```
quiz.ai/
├── public/                    → sito pubblicato (Netlify: publish = public)
│   ├── index.html
│   ├── favicon.svg
│   ├── site.webmanifest
│   ├── supabase-config.js     → generato in build (non in git)
│   └── assets/
│       ├── css/styles.css
│       └── js/
│           ├── main.js        → ingresso
│           ├── quiz-app.js    → logica quiz + storico
│           ├── auth-ui.js     → login / registrazione
│           ├── supabase-client.js
│           ├── parser.js
│           ├── theme.js
│           └── dom.js
├── scripts/
│   └── generate-supabase-config.mjs
├── supabase/
│   ├── schema.sql
│   └── migration_from_v1.sql   → solo se DB già creato senza cartelle
├── netlify.toml
└── .env.example
```

## Come usarlo

1. **Solo HTML/CSS/JS**: niente npm né build. Apri `public/index.html` con doppio clic (`file://`): gli script sono **classici** (non moduli ES). Per **login cloud** serve comunque rete: Supabase viene caricato da **jsDelivr** (CDN). Senza rete il quiz locale funziona, l’account no.
2. **Console Chrome su `file://`**: messaggi tipo *«Unsafe attempt to load URL file://… from frame…»* sono limiti del browser sul protocollo `file:` (ogni percorso = origine diversa; spesso se la pagina è in **anteprima dentro un iframe**, es. nell’editor). Non è un difetto dell’app se il resto funziona. In `index.html` compare un **avviso giallo** quando usi `file://`; per evitare console e avere origine `http://localhost`, servi `public` con HTTP (`python -m http.server` dentro `public`, poi `http://localhost:8000`) oppure apri il file in una **scheda normale** del browser (non nell’anteprima incorporata).
3. Incolla il testo del quiz. Formato: domande (`1.` / `### **1. …**`), opzioni `A)`…`D)`, riga `Risposta: X`, opzionale `Suggerimento:`.
4. **Accedi** / **Registrati**: lo **storico quiz** è solo sul **database** (non viene più salvato in locale). «Salva negli appunti» richiede sessione attiva.
5. **Storico**: cartelle **apribili/chiudibili** (clic sul nome); **+ Nuova cartella**; **Rinomina** su quiz e cartelle; **Sposta in cartella**; **Elimina cartella** (i quiz vanno in «Senza cartella»).
6. Tema **Giorno** / **Notte**, ripresa quiz in sospeso e **Nuovo testo** come prima.

## Supabase

- Esegui `supabase/schema.sql` nel **SQL Editor** (progetto nuovo o allineamento completo).
- Se avevi già la vecchia tabella senza cartelle: esegui anche `supabase/migration_from_v1.sql` (aggiunge `saved_quiz_folders`, `folder_id`, RLS cartelle e corregge il trigger `saved_quizzes_touch_updated_at` con `SET search_path = public` per il linter *Function Search Path Mutable*).
- **RLS quiz + cartelle**: le policy limitano tutto a `authenticated` e al proprio `user_id`; insert/update su `saved_quizzes` richiedono che `folder_id` sia `null` o una cartella **dello stesso utente**. Se il DB era stato creato prima di questo vincolo, esegui anche `supabase/patch_rls_quiz_folder_same_user.sql`.

## Sicurezza (checklist)

- **Repository**: `.env` e `public/supabase-config.js` sono in `.gitignore`; in repo resta solo `.env.example` senza segreti.
- **Netlify**: in *Site settings → Environment variables* imposta `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` (oppure `SUPABASE_URL` + `SUPABASE_ANON_KEY`). Non configurare la **service role** per il build del sito statico: finirebbe nel JS generato.
- **Supabase Dashboard**: verifica che su *Authentication → Providers* e *URL configuration* siano coerenti redirect e sito pubblicato; RLS resta la barriera principale lato dati.
- **Deploy**: `netlify.toml` imposta header `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` sulle risposte statiche.

## Repository

Progetto: [Gabriele06-local/Quiz.ai](https://github.com/Gabriele06-local/Quiz.ai).
