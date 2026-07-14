import Alpine from 'alpinejs';
import {
  getCatalog,
  getAutori,
  getFamiglie,
  getMomenti,
  splitMomenti,
  createCanzoniereEmail,
  createCanzoniereDownload,
  getJobStatus,
  s3FileUrl,
  s3DownloadAllUrl,
  JOB_STATUS_STEPS,
} from '../lib/api';

const LAST_JOB_KEY = 'canzoniere:last-job-id';
const POLL_INTERVAL_MS = 2500;
const RESUME_RETRY_MS = 700;
const RESUME_MAX_RETRIES = 4;

function defaultOptions() {
  return {
    titoletto: '',
    titolo: 'Canzoniere',
    sottotitolo: '',
    num_colonne: 1,
    formato: 'standard',
    accordi: 'both', // sempre esplicito: l'API non genera PDF se viene lasciato vuoto
    font: 'libertine',
    minorsign: '',
    indici: ['titleindex', 'authorsindex'],
    copertina: true, // checkbox: true -> 'cover', false -> nessuna copertina
    deliveryMode: 'email', // 'email' | 'download'
    email: '',
  };
}

// NOTA: questi valori NON sono validati dal backend (vedi README, sezione
// "Cose da verificare con l'API reale"): sono ipotesi ragionevoli da
// confermare con chi gestisce il template LaTeX. Modifica pure questi
// elenchi per farli combaciare con ciò che il template supporta davvero.
const FORMATO_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'a5vert', label: 'A5' },
  { value: 'a5oriz', label: 'A5 orizzontale' },
  { value: 'a6vert', label: 'A6 verticale' },
];
const FONT_OPTIONS = [
  { value: 'libertine', label: 'Libertine' },
  { value: 'palatino', label: 'palatino' }
];
const MINORSIGN_OPTIONS = [
  { value: '', label: 'Predefinito' },
  { value: 'm', label: 'm (Cm)' },
  { value: '-', label: '- (C-)' },
  { value: 'min', label: 'min (Cmin)' },
];

// Righe per pagina selezionabili dall'utente nella tabella del catalogo.
const PAGE_SIZE_OPTIONS = [25, 50, 100];

Alpine.data('canzoniereApp', () => ({
  // --- stato catalogo ---
  loading: true,
  loadError: null,
  catalog: [],
  autori: [],
  famiglie: [],
  momenti: [],

  // --- filtri e tabella ---
  filters: { q: '', autore: '', famiglia: '', momento: '' },
  sortKey: 'titolo',
  sortDir: 'asc',
  page: 1,
  pageSize: 25,
  pageSizeOptions: PAGE_SIZE_OPTIONS,

  // --- opzioni fisse per i menu a tendina del modale ---
  formatoOptions: FORMATO_OPTIONS,
  fontOptions: FONT_OPTIONS,
  minorsignOptions: MINORSIGN_OPTIONS,

  // --- selezione / canzoniere ---
  // `picked`: identificatori spuntati in tabella, in attesa di essere
  // trasferiti nel canzoniere con "Aggiungi selezionate". Non aggiunge
  // nulla da sola.
  picked: [],
  // `selected`: canzoni effettivamente nel canzoniere. Ogni voce ha un
  // `uid` proprio (diverso da `identificatore`) per permettere di
  // aggiungere la stessa canzone più volte.
  selected: [],
  uidCounter: 0,
  mobileTab: 'catalogo',
  dragIndex: null,

  // --- modale opzioni ---
  modalOpen: false,
  options: defaultOptions(),
  submitting: false,
  submitError: null,

  // --- job / stato generazione ---
  job: null,
  jobError: null,
  polling: false,
  resumeJobId: '',
  resumeError: null,
  steps: JOB_STATUS_STEPS,

  async init() {
    try {
      const [catalog, autori, famiglie, momenti] = await Promise.all([
        getCatalog(),
        getAutori(),
        getFamiglie(),
        getMomenti(),
      ]);
      this.catalog = catalog;
      this.autori = autori;
      this.famiglie = famiglie;
      this.momenti = momenti;
    } catch (e) {
      this.loadError = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }

    // Ripresa automatica: ?job=<id> nell'URL, altrimenti proponi l'ultimo
    // job_id salvato in questo browser (se presente).
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('job');
    if (fromUrl) {
      this.resumeJobId = fromUrl;
      this.checkJob(fromUrl);
    } else {
      const last = window.localStorage.getItem(LAST_JOB_KEY);
      if (last) this.resumeJobId = last;
    }
  },

  splitMomenti,

  momentiOf(song) {
    return splitMomenti(song.momenti || '');
  },

  // --- filtro / ordinamento / paginazione tabella ---
  get filteredCatalog() {
    const q = this.filters.q.trim().toLowerCase();
    const autore = this.filters.autore;
    const famiglia = this.filters.famiglia;
    const momento = this.filters.momento;

    let rows = this.catalog.filter((s) => {
      if (autore && s.autore !== autore) return false;
      if (famiglia && (s.famiglia || '').toLowerCase() !== famiglia.toLowerCase()) return false;
      if (momento && !splitMomenti(s.momenti).includes(momento)) return false;
      if (q) {
        const haystack = `${s.titolo} ${s.autore} ${s.album}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    rows = rows.slice().sort((a, b) => {
      const av = (a[this.sortKey] || '').toString();
      const bv = (b[this.sortKey] || '').toString();
      const cmp = av.localeCompare(bv, 'it', { sensitivity: 'base' });
      return this.sortDir === 'asc' ? cmp : -cmp;
    });

    return rows;
  },

  get totalPages() {
    return Math.max(1, Math.ceil(this.filteredCatalog.length / this.pageSize));
  },

  get pagedCatalog() {
    const start = (this.page - 1) * this.pageSize;
    return this.filteredCatalog.slice(start, start + this.pageSize);
  },

  setSort(key) {
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortDir = 'asc';
    }
  },

  resetFiltersAndPage() {
    this.page = 1;
  },

  // Richiamata quando l'utente cambia il numero di righe per pagina.
  changePageSize() {
    this.page = 1;
  },

  // --- picking (checkbox in tabella, NON aggiunge da solo) ---
  isPicked(id) {
    return this.picked.includes(id);
  },

  togglePicked(id) {
    const i = this.picked.indexOf(id);
    if (i === -1) this.picked.push(id);
    else this.picked.splice(i, 1);
  },

  // Stato del checkbox "seleziona tutto il visibile" nell'header della
  // tabella: true se TUTTE le righe della pagina corrente sono spuntate.
  get allVisiblePicked() {
    const visible = this.pagedCatalog;
    return visible.length > 0 && visible.every((s) => this.isPicked(s.identificatore));
  },

  // Toggle: se sono già tutte spuntate le de-seleziona, altrimenti le
  // seleziona tutte. Riguarda solo le righe visibili nella pagina corrente.
  toggleSelectAllVisible() {
    const visible = this.pagedCatalog;
    if (this.allVisiblePicked) {
      const ids = new Set(visible.map((s) => s.identificatore));
      this.picked = this.picked.filter((id) => !ids.has(id));
    } else {
      const already = new Set(this.picked);
      for (const s of visible) {
        if (!already.has(s.identificatore)) this.picked.push(s.identificatore);
      }
    }
  },

  // Quante volte questa canzone è già presente nel canzoniere (per un
  // piccolo badge accanto al pulsante "+ aggiungi").
  countInSelected(id) {
    return this.selected.filter((s) => s.identificatore === id).length;
  },

  // Aggiunge SEMPRE una nuova istanza (permette duplicati), usata dal
  // pulsante "+ aggiungi" di ogni riga del catalogo.
  addSong(song) {
    this.uidCounter += 1;
    this.selected.push({
      uid: this.uidCounter,
      identificatore: song.identificatore,
      titolo: song.titolo,
      autore: song.autore,
      semitoni: 0,
    });
  },

  // Trasferisce tutte le canzoni "picked" nel canzoniere (una istanza per
  // ciascuna, nell'ordine in cui compaiono nel catalogo filtrato) e svuota
  // la selezione dei checkbox.
  addPickedToSelected() {
    if (this.picked.length === 0) return;
    const pickedSet = new Set(this.picked);
    for (const song of this.filteredCatalog) {
      if (pickedSet.has(song.identificatore)) this.addSong(song);
    }
    this.picked = [];
  },

  // Rimuove una singola istanza dal canzoniere (per `uid`, non per
  // `identificatore`: due istanze della stessa canzone sono indipendenti).
  removeSong(uid) {
    this.selected = this.selected.filter((s) => s.uid !== uid);
  },

  // Svuota completamente il canzoniere, con conferma per evitare click
  // accidentali che cancellerebbero tutto il lavoro fatto.
  clearSelected() {
    if (this.selected.length === 0) return;
    const ok = window.confirm(
      `Vuoi svuotare il canzoniere? Verranno rimosse tutte le ${this.selected.length} canzoni inserite.`
    );
    if (ok) this.selected = [];
  },

  moveUp(index) {
    if (index <= 0) return;
    const arr = this.selected;
    [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
  },

  moveDown(index) {
    if (index >= this.selected.length - 1) return;
    const arr = this.selected;
    [arr[index + 1], arr[index]] = [arr[index], arr[index + 1]];
  },

  // Drag & drop semplice (desktop); su mobile si usano le frecce su/giù.
  onDragStart(index) {
    this.dragIndex = index;
  },
  onDragOver(index, ev) {
    ev.preventDefault();
  },
  onDrop(index) {
    if (this.dragIndex === null || this.dragIndex === index) return;
    const arr = this.selected;
    const [moved] = arr.splice(this.dragIndex, 1);
    arr.splice(index, 0, moved);
    this.dragIndex = null;
  },

  // --- modale opzioni ---
  openModal() {
    if (this.selected.length === 0) return;
    this.modalOpen = true;
  },
  closeModal() {
    this.modalOpen = false;
  },
  toggleIndice(name) {
    const i = this.options.indici.indexOf(name);
    if (i === -1) this.options.indici.push(name);
    else this.options.indici.splice(i, 1);
  },

  // --- generazione ---
  buildPayload() {
    return {
      titoletto: this.options.titoletto || undefined,
      titolo: this.options.titolo || undefined,
      sottotitolo: this.options.sottotitolo || undefined,
      num_colonne: Number(this.options.num_colonne) || 1,
      formato: this.options.formato || undefined,
      accordi: this.options.accordi,
      font: this.options.font || undefined,
      minorsign: this.options.minorsign || undefined,
      indici: this.options.indici,
      copertina: this.options.copertina ? 'cover' : undefined,
      canzoni: this.selected.map((s) => ({
        identificatore: s.identificatore,
        semitoni: Number(s.semitoni) || 0,
      })),
    };
  },

  async submitGenerate() {
    this.submitError = null;
    if (this.selected.length === 0) {
      this.submitError = 'Seleziona almeno una canzone.';
      return;
    }
    if (this.options.deliveryMode === 'email' && !this.options.email.trim()) {
      this.submitError = "L'email è obbligatoria per l'invio via email.";
      return;
    }
    this.submitting = true;
    try {
      const payload = this.buildPayload();
      const accepted =
        this.options.deliveryMode === 'email'
          ? await createCanzoniereEmail({ ...payload, email: this.options.email.trim() })
          : await createCanzoniereDownload(payload);

      window.localStorage.setItem(LAST_JOB_KEY, accepted.job_id);
      this.modalOpen = false;
      this.jobError = null;
      this.job = {
        job_id: accepted.job_id,
        status: 'queued',
        message: accepted.message,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.resumeJobId = accepted.job_id;
      await this.pollJob(accepted.job_id, 0);
    } catch (e) {
      this.submitError = e instanceof Error ? e.message : String(e);
    } finally {
      this.submitting = false;
    }
  },

  // --- stato job / polling ---
  async pollJob(jobId, retryCount) {
    this.polling = true;
    try {
      const status = await getJobStatus(jobId);
      this.job = status;
      this.jobError = null;
      if (status.status !== 'done' && status.status !== 'error') {
        setTimeout(() => this.pollJob(jobId, 0), POLL_INTERVAL_MS);
      } else {
        this.polling = false;
      }
    } catch (e) {
      // Subito dopo la creazione può capitare un 404 per una breve finestra
      // di race condition: ritentiamo un paio di volte prima di arrendersi.
      if (retryCount < RESUME_MAX_RETRIES) {
        setTimeout(() => this.pollJob(jobId, retryCount + 1), RESUME_RETRY_MS);
      } else {
        this.polling = false;
        this.jobError = e instanceof Error ? e.message : String(e);
      }
    }
  },

  // Verifica manuale di un job_id inserito dall'utente (ripresa canzoniere).
  async checkJob(jobIdParam) {
    const jobId = (jobIdParam || this.resumeJobId || '').trim();
    if (!jobId) return;
    this.resumeError = null;
    this.jobError = null;
    try {
      const status = await getJobStatus(jobId);
      this.job = status;
      window.localStorage.setItem(LAST_JOB_KEY, jobId);
      if (status.status !== 'done' && status.status !== 'error' && !this.polling) {
        this.pollJob(jobId, 0);
      }
    } catch (e) {
      this.resumeError = e instanceof Error ? e.message : String(e);
    }
  },

  stepIndex(status) {
    if (status === 'error') return -1;
    return this.steps.findIndex((s) => s.key === status);
  },

  elapsed(job) {
    if (!job) return '';
    const start = new Date(job.created_at).getTime();
    const end = new Date(job.updated_at).getTime();
    const seconds = Math.max(0, Math.round((end - start) / 1000));
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  },

  downloadableFiles(job) {
    if (!job?.files) return [];
    return job.files.filter((f) => /\.(pdf|zip)$/i.test(f.name));
  },

  fileUrl(jobId, filename) {
    return s3FileUrl(jobId, filename);
  },

  downloadAllUrl(jobId) {
    return s3DownloadAllUrl(jobId);
  },
}));

Alpine.start();
