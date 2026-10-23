# Canzoniere Online — sito Astro

Sito statico che unisce:
- pagine generate a build-time dall'API REST del catalogo canzoni (`src/lib/api.ts`);
- contenuti da file Markdown per `/notizie` e `/documentazione` (Content Collections).

## Sviluppo locale

```bash
npm install
npm run dev
```

Di default punta a `https://api.dev.canzoniereonline.it`. Per usare un'altra API in locale,
crea un file `.env`:

```
PUBLIC_API_BASE=https://api.dev.canzoniereonline.it
```

## Build

```bash
npm run build
```

Genera l'output statico in `dist/`, chiamando l'API **una sola volta per ciascun endpoint**
grazie al caching in `src/lib/api.ts` (eccetto `GET /songs/:id`, chiamato una volta per
ciascuna canzone, necessario per avere `testo_completo`/`testo_semplice` di ogni pagina).

## Deploy su Cloudflare Pages (piano gratuito)

1. Crea un progetto Cloudflare Pages collegato a questo repository Git.
2. Build command: `npm run build` — Build output directory: `dist`.
3. In **Settings → Environment variables** imposta `PUBLIC_API_BASE` con l'URL dell'API
   di produzione (i path sono identici a quelli di sviluppo, cambia solo l'host).
4. Nessuna Cloudflare Function è necessaria: il sito è interamente statico.

### Rebuild automatico ogni notte

Dato che i dati vengono "congelati" al momento del build, per riflettere aggiornamenti
del catalogo serve un rebuild periodico:

1. In Cloudflare Pages vai su **Settings → Builds & deployments → Deploy hooks** e crea un
   hook (es. "nightly"): ottieni un URL da chiamare con una `POST` per avviare un nuovo build.
2. Nel repository GitHub, in **Settings → Secrets and variables → Actions**, crea il secret
   `CF_PAGES_DEPLOY_HOOK_URL` con quell'URL.
3. Il workflow `.github/workflows/nightly-rebuild.yml` è già pronto: gira ogni notte alle
   03:00 UTC (modificabile) e può anche essere avviato manualmente da GitHub Actions
   ("Run workflow").

## Struttura delle pagine

| Percorso | Origine dati | Note |
|---|---|---|
| `/` | — | Homepage semplice, editabile in `src/pages/index.astro` (oggetto `HOME`) |
| `/canzoni/singola/:id` | `GET /songs/:id` | Estratto testo (prime righe), link ai PDF |
| `/autori`, `/autori/:autore` | `GET /autori`, `GET /songs/autore/:autore` | — |
| `/momenti`, `/momenti/:momento` | `GET /momenti`, `GET /songs/momento/:momento` | — |
| `/album`, `/album/:album` | derivati da `GET /search` (no filtri) | L'API non ha un endpoint album dedicato: gli album sono ricavati raggruppando l'intero catalogo |
| `/canzoni` | `GET /search` + `GET /songs/:id` (una volta per canzone, per estratto e data di revisione) | Layout a tre colonne: momenti/autori/album a sinistra, schede canzone (con estratto e PDF apribile inline) al centro, ultime modifiche a destra. `/indice` reindirizza qui. |
| `/notizie`, `/notizie/tag/:tag` | `src/content/notizie/*.md` | Content Collection |
| `/documentazione` | `src/content/documentazione/*.md` | Content Collection, ordinabile con il campo `order` |
| `/creacanzoniere` | — | **Placeholder**, da costruire in un secondo momento |

## Ricerca

- **Header** (tutte le pagine tranne home) e **home page**: componente `SearchBox.astro`,
  interroga `/search-index.json` (generato in build da `src/pages/search-index.json.ts`)
  con [Fuse.js](https://www.fusejs.io/) direttamente nel browser — nessuna chiamata all'API
  dal client.
- **`/indice`**: filtro sui dati già presenti nella pagina, nessun fetch aggiuntivo.

## URL di autori/album/momenti

`src/lib/api.ts` normalizza autori, album e momenti in slug puramente ASCII
(`normalizeSlug` + `buildSlugIndex`): minuscolo, senza accenti, spazi/virgole/apostrofi/slash
sostituiti da `-`, con gestione delle collisioni (se due nomi diversi si riducono allo stesso
slug, es. per uno spazio in più o un accento, il secondo diventa `slug-2`, il terzo `slug-3`,
ecc. — deterministico, stabile tra un build e l'altro). Verificato con un mock dell'API
contenente apposta spazi, accenti, "/", apostrofi e quasi-duplicati: build completata senza
errori (34 pagine generate). Gli URL non sono più "reversibili" (niente più
`decodeURIComponent`): la corrispondenza slug→nome originale viene passata come `props` da
`getStaticPaths` a ciascuna pagina, così non serve ricostruirla altrove.

## Cose da verificare prima di andare in produzione

- **Catalogo molto grande**: la build chiama `GET /songs/:id` una volta per ogni canzone
  (in parallelo). Se il catalogo cresce molto, monitora i tempi di build.
- **PDF non ancora generati**: `pdf_testo_url`/`pdf_accordi_url` possono essere assenti o
  puntare a un PDF non ancora pronto (generazione asincrona lato server); la pagina della
  singola canzone gestisce già il caso "assente", ma non verifica che il file esista davvero.

## `/creacanzoniere`

A differenza del resto del sito (statico, dati "congelati" al build), questa pagina è
un'app client-side con [Alpine.js](https://alpinejs.dev/) che parla **dal vivo** con l'API:
catalogo, filtri, creazione del job e polling dello stato sono tutte chiamate fatte dal
browser in tempo reale (l'API ha CORS aperto e nessuna autenticazione, quindi non serve
nessun proxy server-side).

- `src/lib/api.ts` — oltre alle funzioni di catalogo, contiene `createCanzoniereEmail`,
  `createCanzoniereDownload`, `getJobStatus`, `s3FileUrl`, `s3DownloadAllUrl`.
- `src/scripts/creacanzoniere.js` — tutta la logica Alpine (`Alpine.data('canzoniereApp', ...)`):
  caricamento catalogo/autori/famiglie/momenti, filtri + ordinamento + paginazione della
  tabella, selezione multipla (checkbox in tabella), riordino della selezione (drag & drop
  da desktop, frecce ▲▼ sempre disponibili per il touch), apertura modale opzioni,
  generazione (email o download), polling dello stato con retry per la race condition dei
  primi istanti descritta in doc, ripresa di un job da `job_id` inserito a mano o da
  `?job=<id>` nell'URL.
- `src/pages/creacanzoniere.astro` — markup, con due colonne affiancate da tablet in su e
  due tab ("Catalogo" / "Selezionate") sotto i 900px.

**Persistenza in `localStorage`** (dato reale nel browser dell'utente): l'ultimo `job_id`
viene salvato per essere riproposto automaticamente alla riapertura della pagina.

**Cose da verificare con l'API reale:**
- Il flusso "scarica direttamente" (`POST /canzoniere/download` + endpoint `/s3/...`)
  funziona solo se lo storage S3 è abilitato lato server; se non lo è, meglio usare sempre
  "ricevi via email" — la UI lo segnala ma non può verificarlo in anticipo.
- `formato`, `font` e i valori di `indici` diversi da
  `titleindex`/`authorsindex`/`tematicindex` non sono validati dal backend: si possono
  comunque scrivere come testo libero nei relativi campi, ma vale la pena verificarli con
  chi gestisce il template LaTeX prima di proporli come default agli utenti finali.
  (`copertina` invece è confermato: valori sempre espliciti `cover`/`nocover`, mai omesso.)
- Se il catalogo è molto grande, la tabella pagina lato client (25 righe/pagina): senza
  `limit`/`offset` lato server non c'è alternativa a scaricare tutto il catalogo una volta
  e paginare in JS.

## Prossimi passi

- Eventuale drag-and-drop più rifinito su mobile (oggi le frecce ▲▼ coprono il caso touch;
  per un vero trascinamento touch si può aggiungere una libreria dedicata come SortableJS).
- Salvataggio/condivisione di una "bozza" di canzoniere (link con gli id preselezionati).
