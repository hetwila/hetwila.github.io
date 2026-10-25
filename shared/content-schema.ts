import { z } from 'zod'

export const wikiSchema = z.object({
  uid: z.string().regex(/^(wiki|event):[a-z0-9-]+$/),
  routeKey: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  entityType: z.enum(['concept', 'event']),
  aliases: z.array(z.string()).default([]),
  sourceIds: z.array(z.string()).default([]),
  factStatus: z.enum(['canon', 'open', 'working', 'story-local', 'deprecated']),
  narrativeLayer: z.literal('author-reference'),
  publicationStatus: z.enum(['draft', 'review', 'published', 'withdrawn']),
  visibility: z.enum(['public', 'private']),
  settingVersion: z.literal('3.0.3'),
  revision: z.number().int().positive(),
  worldTime: z.object({
    label: z.string(),
    precision: z.enum(['year', 'period']),
    year: z.number().int().optional(),
  }),
  sourceRefs: z.array(z.object({
    path: z.string(),
    anchor: z.string(),
    role: z.enum(['primary', 'supporting']),
  })).min(1),
  relations: z.array(z.object({
    type: z.enum(['concerns', 'mentions']),
    target: z.string(),
  })).default([]),
})

export type WikiMetadata = z.infer<typeof wikiSchema>

export interface PublicDocument extends WikiMetadata {
  path: string
  bodyMarkdown: string
  markdownUrl: string
  jsonUrl: string
}
