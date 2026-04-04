/**
 * Testi dei prompt per l'LLM, uno per formato di studio.
 * Popola le textarea nella card "Prompt per l'IA" (index.html).
 */
(function () {
  const RULES = `Devi produrre un quiz a scelta multipla in ITALIANO, come testo semplice (niente JSON, niente HTML). L'output sarà incollato nell'app Quiz.ai che accetta SOLO questo schema.

REGOLE OBBLIGATORIE (identiche per tutti i formati di studio — cambia solo come userai il quiz in app)

1) OGNI domanda deve iniziare con una riga che, dopo eventuali cancelletti Markdown (# … ###), contenga un numero e poi punto o parentesi e il testo. Esempi validi:
   - 1. Enunciato della domanda
   - 2) Enunciato della domanda
   - ### **3. Enunciato della domanda**
   Righe successive (prima delle opzioni) possono continuare l'enunciato.

2) Subito dopo l'enunciato servono ESATTAMENTE quattro opzioni, lettere A B C D, ciascuna su una riga che inizia con la lettera e poi ), . oppure : e uno spazio:
   A) …
   B) …
   C) …
   D) …

3) Subito dopo le quattro opzioni, UNA sola riga con la risposta corretta, con una di queste forme (lettera A–D):
   Risposta: C
   Risposta corretta: C
   ✅ Risposta: C
   (Markdown tipo ** sulla riga va bene.)

4) Opzionale, dopo la risposta: suggerimento su una o più righe che iniziano con:
   Suggerimento: …
   oppure 💡 Suggerimento: …
   oppure Hint: …

5) Righe che sono solo trattini/asterischi (es. --- o ***) sono separatori e vanno ignorate nel contenuto.

6) Non passare alla domanda successiva senza aver messo tutte e quattro le opzioni e la riga "Risposta: X" per quella domanda.

`;

  const TAIL = `Restituisci solo il testo del quiz così formattato, senza commenti introduttivi o finali.`;

  const EXAMPLE_MCQ = `ESEMPIO (schema generico MCQ; replicare per le altre domande):

1. Qual è la capitale d'Italia?

A) Milano
B) Roma
C) Napoli
D) Torino

Risposta: B

---

2. Quale di questi è un protocollo di livello trasporto?

A) HTTP
B) TCP
C) IP
D) Ethernet

Risposta: B
Suggerimento: TCP è orientato alla connessione; IP è di rete.

${TAIL}`;

  const EXAMPLE_FILL_BANK = `ESEMPIO (nota: nel testo compare la parola "Roma" che coincide con l'opzione corretta — così l'app può creare un buco):

1. Tra le grandi città italiane, la capitale politica dello Stato è Roma; Milano è il principale polo economico.

A) Milano
B) Roma
C) Napoli
D) Torino

Risposta: B

---

2. A livello di trasporto, il protocollo TCP garantisce affidabilità; spesso si affianca a IP nel modello a strati.

A) UDP
B) TCP
C) ICMP
D) ARP

Risposta: B

${TAIL}`;

  const EXAMPLE_FILL_OPEN = `ESEMPIO (risposte corrette BREVI — l'utente le riscrive a mano; stesso tipo per tutte le opzioni):

1. In quale anno è convenzionalmente collassato l'Impero romano d'Occidente?

A) 376
B) 476
C) 576
D) 676

Risposta: B

---

2. Chi ha pubblicato la relazione tra massa ed energia nella forma E = mc²?

A) Newton
B) Einstein
C) Bohr
D) Planck

Risposta: B

${TAIL}`;

  const EXAMPLE_MATCH = `ESEMPIO (sinistra = descrizione autosufficiente; destra in app = solo le risposte corrette mescolate — ogni risposta corretta deve avere testo UNICO nel file):

1. Protocollo del livello trasporto, orientato alla connessione, con ritrasmissione e controllo di congestione; spesso accoppiato a IP.

A) UDP
B) TCP
C) ICMP
D) HTTP

Risposta: B

---

2. Numero logico che identifica un servizio su un host (es. 80 per HTTP in molti casi).

A) Indirizzo MAC
B) Numero di porta
C) Indirizzo IP
D) Jitter

Risposta: B

${TAIL}`;

  const EXAMPLE_FLASH = `ESEMPIO (fronte = domanda secca; retro in app = lettera + testo opzione corretta + eventuale suggerimento):

1. Cos'è il jitter in una rete di pacchetti?

A) Il ritardo minimo fisso
B) La variazione del ritardo nel tempo
C) La velocità massima del link
D) Il BER medio

Risposta: B
Suggerimento: contrapposto a un ritardo "costante", pensa alla dispersione dei tempi di arrivo.

---

2. Chi ha formulato la teoria della relatività ristretta con E = mc²?

A) Newton
B) Einstein
C) Galileo
D) Hawking

Risposta: B

${TAIL}`;

  const HDR_MCQ = `══════════════════════════════════════
QUIZ.AI — PROMPT PER FORMATO: SCELTA MULTIPLA
══════════════════════════════════════

`;

  const HDR_FILL_BANK = `══════════════════════════════════════
QUIZ.AI — PROMPT PER FORMATO: COMPLETAMENTO CON PAROLE SUGGERITE (chip A–D)
Obiettivo: enunciati dove una parola coincide con il testo dell'opzione corretta (per il "buco").
══════════════════════════════════════

`;

  const HDR_FILL_OPEN = `══════════════════════════════════════
QUIZ.AI — PROMPT PER FORMATO: COMPLETAMENTO APERTO (scrittura libera)
Obiettivo: opzione corretta breve e confrontabile (1–6 parole, numero, nome, acronimo).
══════════════════════════════════════

`;

  const HDR_MATCH = `══════════════════════════════════════
QUIZ.AI — PROMPT PER FORMATO: ABBINA DESCRIZIONE ↔ RISPOSTA
Obiettivo: descrizioni lunghe a sinistra, etichette corte e univoche come risposta corretta (mai ripetute tra domande).
══════════════════════════════════════

`;

  const HDR_FLASH = `══════════════════════════════════════
QUIZ.AI — PROMPT PER FORMATO: FLASHCARD
Obiettivo: domanda sul fronte, risposta memorizzabile sul retro; suggerimenti utili.
══════════════════════════════════════

`;

  const MOD_MCQ = `COSA CHIEDERE ALL'IA (solo per questo formato)
- Enunciati chiari, quattro distrattori credibili, una sola risposta corretta.
- Evita che due opzioni restino ugualmente plausibili con la stessa formulazione della domanda.

`;

  const MOD_FILL_BANK = `COSA CHIEDERE ALL'IA (solo per questo formato)
- L'app può sostituire con un "buco" una parola dell'enunciato se è lunga almeno 3 caratteri e compare nel testo dell'opzione CORRETTA.
- Metti nell'enunciato, in modo naturale, almeno una parola IDENTICA a una porzione del testo dell'opzione corretta (stessa ortografia).
- Le opzioni errate non devono contenere quella stessa parola chiave al centro del buco.
- Preferisci risposte corrette con termine distintivo (nome, data, acronimo) piuttosto che frasi intere duplicate.

`;

  const MOD_FILL_OPEN = `COSA CHIEDERE ALL'IA (solo per questo formato)
- Opzione corretta: breve (1–6 parole, un numero, un nome, un acronimo). L'utente la digita a mano.
- I tre distrattori: stesso tipo di risposta (tutte anni, tutti nomi, tutte città, ecc.).
- Evita differenze solo di punteggiatura tra corretta e distrattori.

`;

  const MOD_MATCH = `COSA CHIEDERE ALL'IA (solo per questo formato)
- Enunciato = mini-scenario o definizione completa (chi legge solo quello capisce il riferimento).
- Opzione corretta = etichetta breve (concetto, protocollo, valore) che si abbina solo a quella descrizione nel gruppo.
- CRITICO: nel file intero, il testo dopo la lettera giusta (es. "B) TCP") non deve ripetersi come risposta corretta in un'altra domanda — stringhe duplicate a destra rendono l'abbinamento ambiguo.

`;

  const MOD_FLASH = `COSA CHIEDERE ALL'IA (solo per questo formato)
- Enunciato = domanda diretta o richiamo ("Cos'è …?", "Definisci …", "Chi …?") adatto al solo fronte della card.
- Opzione corretta = risposta che vuoi memorizzare (anche una riga, ma netta).
- Distrattori = plausibili ma concettualmente separabili sul retro.
- Suggerimento: consigliato (mnemonico, contrasto con un falso mit).

`;

  const PROMPTS = {
    mcq: HDR_MCQ + RULES + MOD_MCQ + EXAMPLE_MCQ,
    fill_bank: HDR_FILL_BANK + RULES + MOD_FILL_BANK + EXAMPLE_FILL_BANK,
    fill_open: HDR_FILL_OPEN + RULES + MOD_FILL_OPEN + EXAMPLE_FILL_OPEN,
    match: HDR_MATCH + RULES + MOD_MATCH + EXAMPLE_MATCH,
    flash: HDR_FLASH + RULES + MOD_FLASH + EXAMPLE_FLASH,
  };

  function initExclusiveAccordion() {
    const acc = document.querySelector(".llm-prompt-accordion");
    if (!acc) return;
    acc.querySelectorAll("details.llm-prompt-disclosure").forEach((d) => {
      d.addEventListener("toggle", () => {
        if (!d.open) return;
        acc.querySelectorAll("details.llm-prompt-disclosure").forEach((other) => {
          if (other !== d) other.open = false;
        });
      });
    });
  }

  function fill() {
    const map = [
      ["llm-prompt-mcq", PROMPTS.mcq],
      ["llm-prompt-fill-bank", PROMPTS.fill_bank],
      ["llm-prompt-fill-open", PROMPTS.fill_open],
      ["llm-prompt-match", PROMPTS.match],
      ["llm-prompt-flash", PROMPTS.flash],
    ];
    map.forEach(([id, text]) => {
      const el = document.getElementById(id);
      if (el) el.value = text;
    });
    initExclusiveAccordion();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fill);
  else fill();
})();
