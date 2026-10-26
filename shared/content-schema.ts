import { z } from 'zod'

// Titles stay readable in filenames and URLs. Encoding is only a transport
// concern; reserved path characters and normalization collisions are rejected.
export const routeKeySchema = z.string().min(1).max(100)
  .regex(/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} _·（）()、，：《》「」-]*$/u)
  .refine(value => value === value.trim() && value === value.normalize('NFC'), 'Use a trimmed NFC title')
  .refine(value => !['index', 'category'].includes(value.toLowerCase()), 'Reserved route')

const commonSchema = z.object({
  routeKey: routeKeySchema,
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  nameStatus: z.enum(['official', 'working', 'descriptive']).default('descriptive'),
  sourceIds: z.array(z.string()).default([]),
  factStatus: z.enum(['canon', 'open', 'working', 'story-local', 'deprecated']),
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
    type: z.enum(['concerns', 'mentions', 'depicts']),
    target: z.string(),
  })).default([]),
})

export const embeddedEventSchema = z.object({
  uid: z.string().regex(/^event:[\p{L}\p{M}\p{N}·()-]+$/u),
  title: z.string().min(1),
  description: z.string().min(1),
  anchor: z.string().regex(/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u),
  aliases: z.array(z.string()).default([]),
  sourceIds: z.array(z.string()).min(1),
  sourceRefs: commonSchema.shape.sourceRefs,
  worldTime: z.object({ label: z.string(), precision: z.literal('year'), year: z.number().int() }),
})

export const wikiSchema = commonSchema.extend({
  uid: z.string().regex(/^(wiki|event):[\p{L}\p{M}\p{N}·()-]+$/u),
  entityType: z.enum(['concept', 'event', 'person', 'institution']),
  narrativeLayer: z.literal('author-reference'),
  events: z.array(embeddedEventSchema).default([]),
})

export const storySchema = commonSchema.extend({
  uid: z.string().regex(/^story:[\p{L}\p{M}\p{N}·()-]+$/u),
  entityType: z.literal('story'),
  factStatus: z.literal('story-local'),
  narrativeLayer: z.literal('fiction'),
  scopeUid: z.string().startsWith('story:'),
})

export type WikiMetadata = z.infer<typeof wikiSchema>
export type StoryMetadata = z.infer<typeof storySchema>
export type ContentMetadata = WikiMetadata | StoryMetadata

export type EventRecord = Omit<z.infer<typeof embeddedEventSchema>, 'anchor'> & {
  articleUid: string
  path: string
  embedded: boolean
}

export type PublicDocument = ContentMetadata & {
  path: string
  bodyMarkdown: string
  markdownUrl: string
  jsonUrl: string
  originalMarkdownUrl?: string
  originalSha256?: string
}

export interface ContentRelation {
  source: string
  target: string
  type: 'concerns' | 'mentions' | 'depicts'
  origin: 'metadata' | 'markdown'
  sourcePath: string
  targetPath: string
  targetArticleUid: string
  sectionId?: string
}
