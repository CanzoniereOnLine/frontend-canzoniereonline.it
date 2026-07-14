import { API_BASE } from '../consts';

export interface SongSummary {
  identificatore: string;
  titolo: string;
  autore: string;
  album: string;
  tonalita: string;
  famiglia: string;
  momenti: string; // stringa separata da ";"
  pdf_testo_url?: string;
  pdf_accordi_url?: string;
}

export interface Song extends SongSummary {
  gruppo?: string;
  data_revisione?: string;
  trascrittore?: string;
  testo_completo: string;
  testo_semplice: string;
}

interface ListResponse {
  count: number;
  results: SongSummary[];
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`API ${path} -> ${res.status}: ${body.error ?? 'errore sconosciuto'}`);
  }
  return res.json() as Promise<T>;
}

// --- Caching in memoria per la durata di un singolo build ---
// Astro esegue `astro build` in un unico processo Node, quindi queste
// promise condivise evitano di richiamare l'API più volte per lo stesso dato,
// anche se getCatalog()/getAutori()/ecc. vengono usate da più pagine diverse.

let _catalogPromise: Promise<SongSummary[]> | null = null;
export function getCatalog(): Promise<SongSummary[]> {
  if (!_catalogPromise) {
    _catalogPromise = getJSON<ListResponse>('/search').then((r) => r.results);
  }
  return _catalogPromise;
}

let _autoriPromise: Promise<string[]> | null = null;
export function getAutori(): Promise<string[]> {
  if (!_autoriPromise) _autoriPromise = getJSON<string[]>('/autori');
  return _autoriPromise;
}

let _famigliePromise: Promise<string[]> | null = null;
export function getFamiglie(): Promise<string[]> {
  if (!_famigliePromise) _famigliePromise = getJSON<string[]>('/famiglie');
  return _famigliePromise;
}

let _momentiPromise: Promise<string[]> | null = null;
export function getMomenti(): Promise<string[]> {
  if (!_momentiPromise) _momentiPromise = getJSON<string[]>('/momenti');
  return _momentiPromise;
}

const _songCache = new Map<string, Promise<Song>>();
export function getSong(id: string): Promise<Song> {
  if (!_songCache.has(id)) {
    _songCache.set(id, getJSON<Song>(`/songs/${encodeURIComponent(id)}`));
  }
  return _songCache.get(id)!;
}

export async function getSongsByAutore(autore: string): Promise<SongSummary[]> {
  const r = await getJSON<ListResponse>(`/songs/autore/${encodeURIComponent(autore)}`);
  return r.results;
}

export async function getSongsByMomento(momento: string): Promise<SongSummary[]> {
  const r = await getJSON<ListResponse>(`/songs/momento/${encodeURIComponent(momento)}`);
  return r.results;
}

export async function getSongsByFamiglia(famiglia: string): Promise<SongSummary[]> {
  const r = await getJSON<ListResponse>(`/songs/famiglia/${encodeURIComponent(famiglia)}`);
  return r.results;
}

// L'API non espone un endpoint dedicato per gli album: li deriviamo
// dal catalogo completo, raggruppando per il campo `album`.
export async function getAlbums(): Promise<string[]> {
  const catalog = await getCatalog();
  const set = new Set<string>();
  for (const s of catalog) {
    if (s.album && s.album.trim()) set.add(s.album.trim());
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
}

export async function getSongsByAlbum(album: string): Promise<SongSummary[]> {
  const catalog = await getCatalog();
  return catalog.filter((s) => s.album?.trim() === album);
}

export function splitMomenti(momenti: string | null | undefined): string[] {
  return (momenti ?? '')
    .split(';')
    .map((m) => m.trim())
    .filter(Boolean);
}

// --- Slug per autori/album/momenti ---
// Autori e album nel catalogo possono contenere spazi, virgole, apostrofi,
// accenti e persino "/" (es. "Guerrini/Turoldo"): usarli grezzi (o solo
// encodeURIComponent) come segmento di URL può creare nomi di file "strani" e
// far fallire la build statica su alcuni ambienti. Qui normalizziamo per
// davvero: solo minuscolo, ascii, "-", niente accenti/punteggiatura/spazi.
//
// Essendo una trasformazione "lossy" (non invertibile), non possiamo più
// ricavare il nome originale decodificando lo slug: costruiamo invece, una
// sola volta per build, una mappa slug<->nome a partire dall'elenco
// canonico (getAutori()/getAlbums()/getMomenti()), con gestione delle
// collisioni (se due nomi diversi producono lo stesso slug base, il
// secondo diventa "slug-2", il terzo "slug-3", ecc.).
export function normalizeSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // rimuove i segni diacritici (é->e, à->a, ...)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface SlugIndex {
  toSlug: Map<string, string>; // nome originale -> slug
  toName: Map<string, string>; // slug -> nome originale
}

export function buildSlugIndex(values: string[]): SlugIndex {
  const toSlug = new Map<string, string>();
  const toName = new Map<string, string>();
  const counts = new Map<string, number>();

  for (const value of values) {
    const base = normalizeSlug(value) || 'voce';
    const n = counts.get(base) ?? 0;
    const slug = n === 0 ? base : `${base}-${n + 1}`;
    counts.set(base, n + 1);
    toSlug.set(value, slug);
    toName.set(slug, value);
  }

  return { toSlug, toName };
}

let _autoriSlugPromise: Promise<SlugIndex> | null = null;
export function getAutoriSlugIndex(): Promise<SlugIndex> {
  if (!_autoriSlugPromise) _autoriSlugPromise = getAutori().then(buildSlugIndex);
  return _autoriSlugPromise;
}

let _albumSlugPromise: Promise<SlugIndex> | null = null;
export function getAlbumSlugIndex(): Promise<SlugIndex> {
  if (!_albumSlugPromise) _albumSlugPromise = getAlbums().then(buildSlugIndex);
  return _albumSlugPromise;
}

let _momentiSlugPromise: Promise<SlugIndex> | null = null;
export function getMomentiSlugIndex(): Promise<SlugIndex> {
  if (!_momentiSlugPromise) _momentiSlugPromise = getMomenti().then(buildSlugIndex);
  return _momentiSlugPromise;
}

// --- API di generazione canzoniere ---
// Queste funzioni sono pensate per essere chiamate anche dal browser
// (pagina /creacanzoniere), non solo in fase di build: nessuna dipendenza
// server-only, l'API ha CORS aperto e nessuna autenticazione.

export type Accordi = 'lyric' | 'chorded' | 'both';
export type Indice = 'titleindex' | 'authorsindex' | 'tematicindex' | (string & {});

export interface CanzonieSong {
  identificatore: string;
  semitoni?: number;
}

export interface CanzonieRequest {
  titoletto?: string;
  titolo?: string;
  sottotitolo?: string;
  num_colonne?: number;
  formato?: string;
  accordi: Accordi; // sempre esplicito, vedi nota nella documentazione API
  font?: string;
  minorsign?: string;
  indici?: Indice[];
  copertina?: string;
  email?: string; // obbligatoria solo per createCanzoniereEmail
  canzoni: CanzonieSong[];
}

export interface CanzonieAccepted {
  status: 'accepted';
  job_id: string;
  message: string;
  status_url?: string;
}

export type JobStatusValue =
  | 'queued'
  | 'fetching_songs'
  | 'compiling'
  | 'packaging'
  | 'uploading'
  | 'done'
  | 'error';

export interface JobFile {
  name: string;
  key: string;
  url: string;
  public_url?: string;
}

export interface JobStatus {
  job_id: string;
  status: JobStatusValue;
  message: string;
  created_at: string;
  updated_at: string;
  error?: string;
  files?: JobFile[];
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? `Errore ${res.status}`);
  }
  return data as T;
}

// Invia il canzoniere via email (POST /canzoniere) — richiede `email`.
export function createCanzoniereEmail(payload: CanzonieRequest): Promise<CanzonieAccepted> {
  if (!payload.email) throw new Error('Email obbligatoria per l\'invio via email');
  return postJSON<CanzonieAccepted>('/canzoniere', payload);
}

// Genera il canzoniere per il download diretto (POST /canzoniere/download) —
// funziona solo se lo storage S3 è abilitato lato server.
export function createCanzoniereDownload(
  payload: Omit<CanzonieRequest, 'email'>
): Promise<CanzonieAccepted> {
  return postJSON<CanzonieAccepted>('/canzoniere/download', payload);
}

// GET /canzoniere/status/:job_id — nota: subito dopo la creazione del job può
// capitare un 404 per una breve finestra di race condition: chi chiama questa
// funzione dovrebbe prevedere qualche retry ravvicinato nei primi istanti.
export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${API_BASE}/canzoniere/status/${encodeURIComponent(jobId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? `Errore ${res.status}`);
  }
  return data as JobStatus;
}

// URL "proxati" e firmati lato server per scaricare i file di un job:
// da preferire sempre rispetto a url/public_url dentro JobStatus.files[].
export function s3FileUrl(jobId: string, filename: string): string {
  return `${API_BASE}/s3/${encodeURIComponent(jobId)}/${encodeURIComponent(filename)}`;
}

export function s3DownloadAllUrl(jobId: string): string {
  return `${API_BASE}/s3/${encodeURIComponent(jobId)}/download`;
}

export const JOB_STATUS_STEPS: { key: JobStatusValue; label: string }[] = [
  { key: 'queued', label: 'In coda' },
  { key: 'fetching_songs', label: 'Recupero canzoni' },
  { key: 'compiling', label: 'Compilazione' },
  { key: 'packaging', label: 'Creazione ZIP' },
  { key: 'uploading', label: 'Caricamento' },
  { key: 'done', label: 'Pronto' },
];

