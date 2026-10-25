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
    // Tailwind's custom theme generates CSS; the UI merger also needs to
    // know these names so e.g. text-card replaces text-base, not text color.
    tv: {
      twMergeConfig: {
        extend: {
          theme: {
            text: ['2xs', 'label', 'meta', 'caption', 'detail', 'copy', 'body', 'prose', 'card', 'section', 'title', 'display'],
            spacing: ['gutter', 'inline', 'stack', 'panel', 'section', 'layout', 'grid', 'page-block', 'control', 'icon'],
            container: ['page', 'reading', 'search'],
            radius: ['card', 'hero'],
            shadow: ['card'],
            leading: ['copy', 'prose', 'heading'],
            tracking: ['label', 'heading', 'display'],
          },
        },
      },
    },
    button: { slots: { base: 'cursor-pointer font-medium' } },
    container: { base: 'max-w-page px-gutter sm:px-gutter lg:px-gutter' },
    header: { slots: { left: 'lg:flex-none', right: 'lg:flex-none gap-2', container: 'gap-4' } },
    pageCard: {
      slots: {
        // Give the library's overlay link its own hit box as well as its
        // absolute child, so keyboard/browser tooling can target the link.
        root: 'rounded-card [&>a]:absolute [&>a]:inset-0',
        container: 'p-panel sm:p-panel',
        header: 'w-full mb-stack',
        title: 'font-serif text-card font-semibold',
        description: 'text-sm leading-prose',
        footer: 'w-full mt-stack pt-4 border-t border-default',
      },
      variants: {
        variant: { outline: { root: 'bg-raised' } },
        title: { true: { description: 'mt-inline' } },
      },
    },
    card: {
      slots: {
        root: 'rounded-card',
        header: 'p-panel sm:px-panel',
        body: 'p-panel sm:p-panel',
        footer: 'p-panel sm:px-panel',
      },
      variants: { variant: { outline: { root: 'bg-raised' } } },
    },
    modal: {
      slots: { content: 'bg-raised' },
      variants: { fullscreen: { false: { content: 'rounded-card w-[calc(100vw-var(--ds-page-gutter)*2)]' } } },
    },
    contentToc: { slots: { container: 'lg:py-0', link: 'text-caption leading-prose' } },
  },
})
