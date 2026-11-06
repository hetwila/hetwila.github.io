import type { ComputedRef, InjectionKey } from 'vue'
export interface FictionReadingContext { uid: string; ownerId?: string; documentId?: string; enabled: boolean }
export const fictionReadingContext: InjectionKey<ComputedRef<FictionReadingContext>> = Symbol('fiction-reading')
