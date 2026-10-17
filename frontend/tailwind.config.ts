import type { Config } from 'tailwindcss'

export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--c-canvas)',
        panel: 'var(--c-panel)',
        subtle: 'var(--c-subtle)',
        raised: 'var(--c-raised)',
        overlay: 'var(--c-overlay)',
        inverse: 'var(--c-inverse)',
        scrim: 'var(--c-scrim)',
        line: {
          DEFAULT: 'var(--c-line)',
          strong: 'var(--c-line-strong)',
        },
        ink: {
          DEFAULT: 'var(--c-ink)',
          soft: 'var(--c-ink-soft)',
          faint: 'var(--c-ink-faint)',
          inverse: 'var(--c-ink-inverse)',
        },
        accent: {
          DEFAULT: 'var(--c-accent)',
          strong: 'var(--c-accent-strong)',
          soft: 'var(--c-accent-soft)',
        },
        danger: {
          DEFAULT: 'var(--c-danger)',
          soft: 'var(--c-danger-soft)',
        },
        success: {
          DEFAULT: 'var(--c-success)',
          soft: 'var(--c-success-soft)',
        },
        warning: {
          DEFAULT: 'var(--c-warning)',
          soft: 'var(--c-warning-soft)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        raised: 'var(--shadow-raised)',
      },
      spacing: {
        sidebar: 'var(--w-sidebar)',
        rail: 'var(--w-rail)',
        column: 'var(--w-column)',
        'list-item': 'var(--pad-list-item)',
        chat: 'var(--gap-chat)',
        compose: 'var(--pad-compose)',
      },
    },
  },
  plugins: [],
} satisfies Config
