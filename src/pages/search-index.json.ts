import type { APIRoute } from 'astro';
import { getCatalog } from '../lib/api';

// Generato una sola volta in fase di build (prerender di default per output: 'static').
// Contiene solo i campi necessari alla ricerca lato client, per restare leggero
// anche con un catalogo ampio.
export const GET: APIRoute = async () => {
  const catalog = await getCatalog();
  const index = catalog.map((s) => ({
    id: s.identificatore,
    titolo: s.titolo,
    autore: s.autore,
    album: s.album,
    momenti: s.momenti,
    famiglia: s.famiglia,
    tonalita: s.tonalita,
  }));

  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json' },
  });
};
