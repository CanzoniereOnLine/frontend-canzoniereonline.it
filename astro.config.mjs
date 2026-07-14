import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.canzoniereonline.it',
  output: 'static',
  build: {
    format: 'directory',
  },
});
