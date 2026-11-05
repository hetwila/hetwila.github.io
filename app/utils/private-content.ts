import routes from '../../.generated/private-routes.json'
import { privateContentPath } from '#shared/private-content'

// The stable query reader also works for manuscripts created after this build.
export function privateReadingPath(id: string) {
  const path = privateContentPath(id)
  return import.meta.dev || (routes as string[]).includes(path) ? path : `/private/read?id=${id}`
}
