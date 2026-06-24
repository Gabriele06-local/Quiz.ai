# Quiz.ai

[![CI](https://github.com/Gabriele06-local/Quiz.ai/actions/workflows/ci.yml/badge.svg)](https://github.com/Gabriele06-local/Quiz.ai/actions/workflows/ci.yml)
[![Docker](https://github.com/Gabriele06-local/Quiz.ai/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/Gabriele06-local/Quiz.ai/actions/workflows/docker-publish.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Netlify Status](https://api.netlify.com/api/v1/badges/--/deploy-status)](https://app.netlify.com/sites/quizioai/deploys)

App web statica per studiare con quiz a scelta multipla: incolli il testo, l'app riconosce domande e risposte e ti guida domanda per domanda.

**Online:** [quizioai.netlify.app](https://quizioai.netlify.app/)

## Funzionalità

- **Incolla il testo** del quiz: l'app parserizza domande (`1.`, `### **1.**`), opzioni (`A)`..`D)`) e risposte corrette
- **5 modalità di studio**: classica, completamento con word bank, completamento aperto, matching, flashcard
- **Timer** per domanda o per intero quiz, modalità esame senza feedback immediato
- **Tema chiaro/scuro** persistente
- **Account cloud** (Supabase) per salvare quiz e statistiche
- **Matematica** con KaTeX (delimitatori `$...$` e `$$...$$`)
- **Storico** con cartelle, rinomina, sposta, esporta in JSON/TXT/Markdown
- **LLM Prompt Generator**: prompt precompilati per ChatGPT/Claude/Gemini

## Struttura

```
quiz.ai/
├── public/                  → sito statico (publish dir)
│   ├── index.html
│   ├── stats.html
│   ├── assets/
│   │   ├── css/styles.css
│   │   └── js/              → JS vanilla (IIFE, no bundler)
│   └── supabase-config.js   → generato in build
├── scripts/
│   └── generate-supabase-config.mjs
├── supabase/
│   ├── schema.sql
│   └── migration_from_v1.sql
├── tests/                   → test unitari (Vitest + jsdom)
├── Dockerfile               → build immagine Nginx multi-stage
├── docker-compose.yml
└── .github/workflows/       → CI + Docker publish
```

## Sviluppo

```bash
# Installa dipendenze (solo per test/lint)
npm install

# Test unitari
npm test

# Lint
npm run lint

# Genera supabase-config.js
cp .env.example .env
# modifica .env con i tuoi dati Supabase
npm run build
```

## Docker

```bash
# Build e avvia
docker compose up -d

# Oppure build manuale
docker build -t quiz-ai .
docker run -p 8080:80 quiz-ai
```

## Supabase

1. Crea un progetto su [supabase.com](https://supabase.com)
2. Esegui `supabase/schema.sql` nel SQL Editor
3. Imposta le variabili d'ambiente (vedi `.env.example`)
4. Per statistiche: esegui `supabase/migration_quiz_attempts.sql`

## CI/CD

- **CI** (`.github/workflows/ci.yml`): lint + test + build check su ogni push/PR
- **Docker** (`.github/workflows/docker-publish.yml`): build e push su ghcr.io
- **Netlify**: deploy automatico dal branch main configurato su [netlify.com](https://netlify.com)

## Licenza

MIT — vedi [LICENSE](LICENSE).
