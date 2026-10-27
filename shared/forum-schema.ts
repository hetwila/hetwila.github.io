import { z } from 'zod'
import { routeKeySchema } from './content-schema.ts'

// Forum discussions have their own scope. They do not enter the wiki graph
// or inherit its fact status, sources or event relations.
export const forumThreadSchema = z.object({
  uid: z.string().regex(/^thread:[\p{L}\p{M}\p{N}·()-]+$/u),
  routeKey: routeKeySchema,
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  community: z.string().trim().min(1),
  board: z.string().trim().min(1),
  category: z.string().trim().min(1),
  narrativeLayer: z.literal('in-world-discussion'),
  scopeUid: z.string().startsWith('thread:'),
  publicationStatus: z.enum(['draft', 'review', 'published', 'withdrawn']),
  visibility: z.enum(['public', 'private']),
  settingVersion: z.literal('3.0.3'),
  revision: z.number().int().positive(),
  originalFile: z.string().regex(/^[^/\\]+\.md$/u),
}).strict()

export const forumPostSchema = z.object({
  uid: z.string().startsWith('post:'),
  threadUid: z.string().startsWith('thread:'),
  scopeUid: z.string().startsWith('thread:'),
  narrativeLayer: z.literal('in-world-discussion'),
  // Content 3.16 maps JSON Schema "integer" to TEXT. Keep the numeric SQL
  // column while retaining integer validation before collection generation.
  floor: z.number().positive().refine(Number.isInteger, 'Floor must be an integer'),
  author: z.string().min(1),
  isOriginalPoster: z.boolean(),
})

export type ForumThreadMetadata = z.infer<typeof forumThreadSchema>
export type ForumPostMetadata = z.infer<typeof forumPostSchema>
