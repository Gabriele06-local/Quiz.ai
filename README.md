# Quiz.ai

App web statica per studiare con quiz a scelta multipla: incolli il testo, l’app riconosce domande e risposte e ti guida domanda per domanda.

## Come usarlo

1. Apri **`index.html`** nel browser (doppio clic sul file). Non serve installare nulla né avviare un server.
2. Incolla il testo del quiz nell’area grande. Il formato atteso è:
   - domande numerate (`1.` oppure `1)`) oppure titoli Markdown (`### **1. …**`);
   - quattro opzioni `A)` … `D)`;
   - una riga con la soluzione: `Risposta: C` oppure `✅ **Risposta: C**`;
   - opzionale: dopo la risposta, `💡 Suggerimento: …` oppure `Suggerimento: …`;
   - le righe `---` (separatori Markdown) vengono ignorate.
3. Clicca **Analizza e inizia** (oppure **Carica esempio** per provare con un quiz di prova).
4. Scegli un’opzione e conferma. Puoi usare l’**argomentazione** opzionale e, se presente nel testo, il **suggerimento**.
5. A fine quiz vedi il punteggio; le domande sbagliate restano in elenco per il **ripasso**. **Rifai tutto il quiz** riparte dall’inizio.

### Tema

In alto a destra puoi passare tra **Giorno** (chiaro) e **Notte** (scuro). La preferenza resta salvata nel browser.

### Salvataggi nel browser

Tutto è salvato in **localStorage** sul tuo PC (non su server):

- **Quiz in sospeso**: se chiudi la pagina a metà quiz o sui risultati, al prossimo accesso riprendi da dove eri. Dalla schermata iniziale puoi **Continua** o **Scarta sospeso**.
- **Storico quiz**: in fondo alla schermata iniziale trovi i quiz salvati con **Salva negli appunti** (dalla schermata risultati). **Carica** riapre il testo e lo fa ripartire da capo; **Cestina** lo rimuove dallo storico.

**Nuovo testo** (durante il quiz) abbandona la sessione corrente e cancella il quiz in sospeso salvato.

## File del progetto

| File        | Ruolo                          |
| ----------- | ------------------------------ |
| `index.html`| Pagina e struttura             |
| `styles.css`| Stili e temi chiaro/scuro      |
| `app.js`    | Parser del testo e logica quiz |

## Repository

Progetto: [Gabriele06-local/Quiz.ai](https://github.com/Gabriele06-local/Quiz.ai).
