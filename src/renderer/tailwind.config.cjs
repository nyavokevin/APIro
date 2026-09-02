/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Surfaces
        bg: 'var(--bg-primary)',
        panel: 'var(--bg-secondary)',
        'panel-alt': 'var(--bg-tertiary)',
        'panel-hover': 'var(--bg-hover)',
        // Borders
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        // Text
        content: 'var(--text-primary)',
        muted: 'var(--text-secondary)',
        faint: 'var(--text-muted)',
        // Accent
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-subtle': 'var(--accent-subtle)',
        'accent-ink': 'var(--accent-ink)',
        // Semantic
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',
        // Syntax
        'syntax-string': 'var(--syntax-string)',
        'syntax-number': 'var(--syntax-number)',
        'syntax-boolean': 'var(--syntax-boolean)',
        'syntax-null': 'var(--syntax-null)',
        // HTTP methods
        'method-get': 'var(--method-get)',
        'method-post': 'var(--method-post)',
        'method-put': 'var(--method-put)',
        'method-patch': 'var(--method-patch)',
        'method-delete': 'var(--method-delete)',
      },
      borderRadius: {
        // Flat design: minimal rounding only
        DEFAULT: '2px',
      },
    },
  },
  plugins: [],
};