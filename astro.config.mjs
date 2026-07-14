import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.dev.canzoniereonline.it', // TODO: sostituisci con il dominio reale
  output: 'static',
  build: {
    format: 'directory',
  },
});
