import { z } from 'zod'

// Titles stay readable in filenames and URLs. Encoding is only a transport
// concern; reserved path characters and normalization collisions are rejected.
export const routeKeySchema = z.string().min(1).max(100)
  .regex(/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} _·（）()、，：《》「」-]*$/u)
  .refine(value => value === value.trim() && value === value.normalize('NFC'), 'Use a trimmed NFC title')
  .refine(value => !['index', 'category'].includes(value.toLowerCase()), 'Reserved route')

export const wikiSchema = z.object({
  uid: z.string().regex(/^(wiki|event):[\p{L}\p{M}\p{N}·()-]+$/u),
  routeKey: routeKeySchema,
  redirects: z.array(routeKeySchema).default([]),
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  entityType: z.enum(['concept', 'event']),
  aliases: z.array(z.string()).default([]),
  nameStatus: z.enum(['official', 'working', 'descriptive']).default('descriptive'),
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

export interface ContentRelation {
  source: string
  target: string
  type: 'concerns' | 'mentions'
  origin: 'metadata' | 'markdown'
  sourcePath: string
  targetPath: string
  sectionId?: string
}
