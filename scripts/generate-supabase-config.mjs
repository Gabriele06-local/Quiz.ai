/**
 * Genera supabase-config.js per il browser (valori da .env o da variabili Netlify).
 * Uso locale: node scripts/generate-supabase-config.mjs
 * Netlify: command in netlify.toml
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const publicDir = resolve(root, "public");
const envPath = resolve(root, ".env");

if (existsSync(envPath)) {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "";
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

const out = `/* Generato da scripts/generate-supabase-config.mjs — non editare a mano */
window.__QUIZ_SUPABASE__ = ${JSON.stringify({ url, key })};
`;

mkdirSync(publicDir, { recursive: true });
writeFileSync(resolve(publicDir, "supabase-config.js"), out, "utf8");

const isNetlify = String(process.env.NETLIFY || "").toLowerCase() === "true";
if (isNetlify && (!url || !key)) {
  console.error(
    "\n[quiz.ai] Build Netlify: URL o chiave Supabase mancanti.\n" +
      "Le variabili devono essere disponibili durante il BUILD (non solo a runtime).\n" +
      "In Netlify: Site settings → Environment variables → per ciascuna variabile apri le opzioni\n" +
      "e assicurati che sia incluso lo scope «Builds» / «Include in builds» (oltre a Deploy e Functions se serve).\n" +
      "Nomi attesi: NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY\n" +
      "(oppure SUPABASE_URL e SUPABASE_ANON_KEY).\n" +
      "Poi «Trigger deploy» → «Clear cache and deploy site».\n"
  );
  process.exit(1);
}

console.log("public/supabase-config.js written.", url ? "URL ok." : "URL vuoto (solo locale/offline).");
