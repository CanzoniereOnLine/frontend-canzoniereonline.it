import { defineCollection, z } from 'astro:content';

const notizie = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

const documentazione = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    // ordine di visualizzazione nel menu della documentazione
    order: z.number().default(0),
    section: z.string().optional(),
  }),
});

export const collections = { notizie, documentazione };
