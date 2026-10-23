import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://canzoniereonline.it', // TODO: sostituisci con il dominio reale
  output: 'static',
  build: {
    format: 'directory',
  },
  // La vecchia pagina "/indice" è stata sostituita da "/canzoni" (colonna
  // sinistra a blocchi + schede + ultime modifiche): redirect statico per
  // non rompere segnalibri o link esterni già in circolazione.
  redirects: {
    '/indice': '/canzoni',
  },
});
