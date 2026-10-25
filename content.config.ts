import { defineCollection, defineContentConfig } from '@nuxt/content'
import { fileURLToPath } from 'node:url'
import { wikiSchema } from './shared/content-schema'

export default defineContentConfig({
  collections: {
    wiki: defineCollection({
      type: 'page',
      // Resolve from the project root so Content's watcher can match absolute paths.
      source: { cwd: fileURLToPath(new URL('./.generated/content', import.meta.url)), include: 'wiki/*.md' },
      schema: wikiSchema,
    }),
  },
})
