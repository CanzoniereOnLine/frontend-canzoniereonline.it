export const SITE_TITLE = 'Canzoniere Online';
export const SITE_DESCRIPTION =
  'Cerca canzoni, sfoglia autori e momenti liturgici, crea il tuo canzoniere personalizzato.';

// Base URL dell'API. In sviluppo punta all'ambiente dev,
// in produzione va sovrascritta con la variabile d'ambiente PUBLIC_API_BASE
// (impostabile nelle Environment Variables del progetto Cloudflare Pages).
export const API_BASE =
  import.meta.env.PUBLIC_API_BASE ?? 'https://api.dev.canzoniereonline.it';
