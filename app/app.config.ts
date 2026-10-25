export default defineAppConfig({
  ui: {
    colors: {
      primary: 'brand',
      secondary: 'accent',
      neutral: 'canvas',
      success: 'emerald',
      info: 'sky',
      warning: 'amber',
      error: 'rose',
    },
    button: { slots: { base: 'cursor-pointer font-medium' } },
    container: { base: 'max-w-(--ui-container) px-(--ds-page-gutter) sm:px-(--ds-page-gutter) lg:px-(--ds-page-gutter)' },
    header: { slots: { left: 'lg:flex-none', right: 'lg:flex-none gap-2', container: 'gap-4' } },
    pageCard: {
      slots: {
        root: 'rounded-[var(--ds-radius-card)]',
        container: 'p-6 sm:p-7',
        header: 'w-full mb-6',
        title: 'font-serif text-2xl font-semibold',
        description: 'mt-3 text-sm leading-7',
        footer: 'w-full mt-6 pt-4 border-t border-default',
      },
      variants: { variant: { outline: { root: 'bg-raised' } } },
    },
    card: {
      slots: { root: 'rounded-[var(--ds-radius-card)]' },
      variants: { variant: { outline: { root: 'bg-raised' } } },
    },
    modal: { slots: { content: 'rounded-[var(--ds-radius-card)] bg-raised' } },
    contentToc: { slots: { container: 'lg:py-0', link: 'text-xs leading-6' } },
  },
})
