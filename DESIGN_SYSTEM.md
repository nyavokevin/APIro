# APIro / APIForge — Design System & CSS Reference

> Source de vérité : `src/renderer/src/styles/globals.css:1` + `src/renderer/tailwind.config.cjs:1`
> Stack : **Tauri 2 + React 19 + Tailwind CSS 3 + Zustand** — Dark-only, offline-first.
> Thème : *Soft OLED charcoal* — brutalisme outil, pas de cloud, pas de télémétrie.

---

## 1. Principes (globals.css:7)

| Principe | Valeur |
|---|---|
| **Base** | `#070709` soft charcoal, pas `#000` — œil détendu, profondeur par clarté |
| **Bordures** | `1px` comme séparateur principal, teinte violette au hover/focus |
| **Coins** | Sharp `0px` par défaut (identité outil). Opt-in soft `8px` via `.radius-soft` |
| **Élévation** | Lumière du fond + ombres teintées, jamais drop shadows lourdes |
| **Accent unique** | Violet `#8B5CF6`, autres couleurs désaturées |
| **Motion** | `200ms cubic-bezier(0.16,1,0.3,1)` — Linear-inspired, lourd et physique |
| **Typo** | Geist Sans (UI) + JetBrains Mono (code) |

---

## 2. Palette — Variables CSS `:root` (globals.css:23)

### 2.1 Backgrounds
```css
--bg-base: #070709;       /* body, page, header */
--bg-sidebar: #0E0E10;    /* Sidebar 228px */
--bg-card: #121215;       /* Cards, panels alt, inputs, dropdowns */
--bg-card-hover: #16161A;
--bg-input: #121215;
--bg-header: #070709;
--bg-hover: #19191E;      /* hover liste / panel */
--bg-selected: rgba(139,92,246,0.10);
--bg-badge-active: rgba(16,185,129,0.10);
--bg-badge-trial: rgba(148,163,184,0.10);
--bg-button-primary: #8B5CF6;
--bg-button-hover: #7C3AED;
--bg-button-secondary: #18181B; /* Button.tsx secondary */
--bg-dropdown: #121215;
--bg-primary: #070709;    /* alias legacy */
--bg-secondary: #0E0E10;
--bg-tertiary: #121215;
```

### 2.2 Text (WCAG AA sur #070709)
```css
--text-primary: #E6E8F0;  /* corps, titres */
--text-secondary: #9FA3B5; /* muted, descriptions */
--text-tertiary: #71768A;
--text-muted: #7A7F93;     /* placeholders tertiaires, icônes */
--text-white: #FFFFFF;
--text-violet: #8B5CF6;
--text-green: #10B981;
--text-slate: #94A3B8;
```

### 2.3 Borders (échelle teintée violette)
```css
--border-default: #232329;
--border: #232329;         /* alias */
--border-hover: #2E2E36;
--border-strong: #2E2E36;
--border-selected: #8B5CF6;
--border-input-focus: #8B5CF6;
--border-divider: #1E1E24;
--border-subtle: #1A1A20;
```

### 2.4 Accents
```css
--accent-violet: #8B5CF6; --accent-violet-soft: rgba(139,92,246,0.10); --accent-violet-glow: rgba(139,92,246,0.14);
--accent-green: #10B981;  --accent-green-soft: rgba(16,185,129,0.10);
--accent-slate: #94A3B8;  --accent-slate-soft: rgba(148,163,184,0.10);
--accent-red: #EF4444;    --accent-red-soft: rgba(239,68,68,0.10);
--accent-yellow: #FBBF24;
--accent: #8B5CF6; --accent-hover: #7C3AED; --accent-subtle: rgba(139,92,246,0.10); --accent-ink: #FFFFFF;
--success: #10B981; --warning: #FBBF24; --danger: #EF4444; --info: #8B5CF6;
```

### 2.5 Méthodes HTTP (globals.css:91)
```css
--method-get: #10B981;    /* GET vert */
--method-post: #8B5CF6;   /* POST violet */
--method-put: #EAB308;    /* PUT amber */
--method-delete: #EF4444; /* DELETE rouge */
--method-patch: #A78BFA;  /* PATCH lavande */
--syntax-string: #A5D6A7; --syntax-number: #FFCC80; --syntax-boolean: #82AAFF; --syntax-null: #EF4444;
```

### 2.6 Autres teintes inline (hors tokens — à migrer vers vars si réutilisées)
- Scroll thumb `#2A2A32` / hover `#3A3A46` (globals.css:200)
- Texte discret `#5A5E6E`, `#2E2E36` dot, selection `rgba(139,92,246,0.35)`
- Ombres cartes `rgba(0,0,0,0.25-0.5)` + liseré `rgba(255,255,255,0.03-0.06)`
- Gradients header `linear-gradient(90deg, transparent, #1E1E24 8%, #1E1E24 92%, transparent)`

---

## 3. Tailwind — `tailwind.config.cjs:7`

```js
darkMode: 'class'
colors: {
  'api-bg-base':'#070709','api-bg-sidebar':'#0E0E10','api-bg-card':'#121215',
  'api-bg-input':'#121215','api-bg-header':'#070709','api-bg-hover':'#19191E',
  'api-text-primary':'#E6E8F0','api-text-secondary':'#9FA3B5',
  'api-border-default':'#232329','api-border-hover':'#2E2E36',
  'api-violet':'#8B5CF6','api-violet-hover':'#7C3AED',
  'api-green':'#10B981','api-red':'#EF4444','api-yellow':'#FBBF24',
  // aliases var(--*)
  bg:'var(--bg-primary)', panel:'var(--bg-secondary)', border:'var(--border)',
  accent:'var(--accent)', success:'var(--success)', danger:'var(--danger)',
  'method-get':'var(--method-get)' /* ... patch/delete ... */
}
fontFamily: { sans:['Geist','Inter','system-ui'], mono:['JetBrains Mono','Fira Code'] }
fontSize: { '2xs':['11px','14px'], xs:['12px','16px'], sm:['13px','20px'], base:['15px','22px'], lg:['18px','26px'] }
spacing: { 'api-1':'4px','api-2':'8px','api-3':'12px','api-4':'16px','api-6':'24px','api-8':'32px' }
borderRadius: { DEFAULT:'0px', sm:'0px', md:'6px', lg:'8px', xl:'12px', full:'9999px' }
width: { sidebar:'80px' } height: { header:'64px', input:'40px', button:'36px' }
```

**Usage:**
```tsx
<div className="bg-api-bg-card border border-api-border-default text-api-text-primary">
<div className="bg-[var(--bg-selected)] border-[var(--border)]">
<button className="bg-accent hover:bg-accent-hover"> // via alias
```

---

## 4. Typographie (globals.css:98)

```css
--font-sans: 'Geist','Inter',system-ui,-apple-system,sans-serif
--font-mono: 'JetBrains Mono','Fira Code',ui-monospace,Menlo,monospace
--code-font-size: 13px
body: 15px/22px, -webkit-font-smoothing, font-feature "cv11 ss01", text-rendering optimizeLegibility
code,pre,.font-mono: var(--font-mono), ligatures none, tabular-nums optionnel
```

**Import** `globals.css:1`:
```css
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
```

**Échelles Tailwind**: `text-2xs 11px`, `xs 12px`, `sm 13px/20px`, `base 15px/22px`, `lg 18px`, `xl 20px/600`.

**Fonctionnalités** :
- `font-weight 450` pour états inactifs (Tabs), `600-700` pour titres avec `letterSpacing -0.02em` à `-0.03em`
- `caret-color: var(--accent-violet)` + `::selection rgba(139,92,246,0.35)`

---

## 5. Spacing / Layout / Radius (globals.css:103)

```css
--space-1:4px --space-2:8px --space-3:12px --space-4:16px --space-5:20px --space-6:24px --space-8:32px --space-10:40px --space-12:48px
--sidebar-width:220px /* réel 228px Sidebar.tsx */
--header-height:64px --content-padding:32px --card-padding:20px --card-gap:24px
--input-height:40px --button-height:36px
--radius-sm:0px --radius-md:6px --radius-lg:10px --radius-xl:12px --radius-full:9999px --radius-card:8px
```

**Règle radius** :
- `input,select,textarea { border-radius:0 !important }` (globals.css:257)
- `button:not(.radius-soft):not(.avatar) { border-radius:0 }`
- `.radius-soft { border-radius:8px !important }` `.radius-soft-lg 12px` (globals.css:267)
- `.avatar { border-radius:9999px !important }`

---

## 6. Motion / Transitions (globals.css:131 + 243)

```css
--ease-spring: cubic-bezier(0.16,1,0.3,1) /* Linear spring lourd */
--ease-out: cubic-bezier(0.33,1,0.68,1)
--duration-fast:150ms --duration-normal:220ms --duration-slow:360ms
* { transition: color, background-color, border-color, opacity, transform, box-shadow 200ms var(--ease-spring) }
html { scroll-behavior: smooth; scrollbar-gutter: stable }
```

**Animations** :

| Classe | Effet | Usage |
|---|---|---|
| `animate-fadeUp` | `fadeUp 0.5s var(--ease-spring) both` → `translateY(8px)→0` | entrée stagger listes, modals, pages |
| `shimmer` | `translateX(-100% → 100%)` 1.8s | `.skeleton` loading |
| `flow-dash` | `stroke-dashoffset -28` | `FlowEdges.tsx` data-flow animé |
| Press | `scale(0.99)` / `.btn-press scale(0.98)` | feedback tactile boutons |

`@media (prefers-reduced-motion: reduce)` coupe toutes les animations `globals.css:383`.

---

## 7. Comportements globaux (globals.css:139)

**Dark-only forcé** :
```css
html { color-scheme: dark }
html.dark, html.light { color-scheme: dark } /* migration anciens thèmes */
body { background: var(--bg-base); color: var(--text-primary) }
<meta name="theme-color" content="#070709"> <!-- index.html:8 -->
```

**Noise & Vignette** (`body::before` globals.css:168) :
- SVG fractalNoise `baseFrequency 0.9`, opacity `0.015`, `mix-blend: soft-light`, `z-index 9998`

**Scrollbars (globals.css:191)** :
- `::-webkit-scrollbar 6px`, track transparent, thumb `#2A2A32` radius `9999px`, hover `#3A3A46`, corner transparent
- `* { scrollbar-width: thin; scrollbar-color: #2A2A32 transparent }`

**Focus (globals.css:217)** :
- `:focus-visible { outline 2px rgba(139,92,246,0.45), outline-offset 2px, border var(--border-input-focus), box-shadow 0 0 0 4px rgba(139,92,246,0.10) }`
- `input:hover { border #2E2E36 }` / `input:focus { border #8B5CF6 + shadow 0 0 0 3px rgba(139,92,246,0.10) + bg #121215 }`

**Global** : `select { padding-right:2.5rem }`, `.skip-link` a11y, `.tabular-nums` pour data.

---

## 8. Bibliothèque de composants — Fonctionnalités

### 8.1 Button — `src/renderer/src/components/ui/Button.tsx:12`

| Variant | Classes | Quand l'utiliser |
|---|---|---|
| `primary` | `bg-[#8B5CF6] text-white hover:bg-[#7C3AED] shadow 0 0 12px rgba(139,92,246,0.22)` | action principale unique/page |
| `secondary` | `bg-[#18181B] text-[#E6E8F0] border #232329 hover:bg-[#1E1E24] hover:border-[#2E2E36]` | action secondaire par défaut |
| `ghost` | `text-[#7A7F93] hover:text-[#E6E8F0] hover:bg-[#121215] border-transparent` | icon buttons, close, nav |
| `danger` | `bg-[#EF4444] hover:bg-[#DC2626] shadow red` | delete/destructive |

Sizes: `sm px-2.5 py-1 text-xs`, `md px-3.5 py-2 text-sm`. Toujours `rounded-none` + `active:scale-[0.98]` + `gap-2`.

```tsx
<Button variant="primary" size="sm" onClick={...}><Plus size={14}/> New</Button>
<Button variant="ghost" onClick={...}><Trash2 size={14}/> Delete</Button>
```

### 8.2 Input — `src/renderer/src/components/ui/Input.tsx:8`

```tsx
<Input label="API Key" placeholder="sk-..." />
// Rend: label 12px #9FA3B5 tracking 0.02em + input h-40px bg #0E0E10 border #232329 text #E6E8F0
// States: hover #2E2E36, focus #8B5CF6 + shadow, tabular-nums si type=number
```

### 8.3 CodeEditor — `src/renderer/src/components/ui/CodeEditor.tsx:12`

Textarea mono `bg #0E0E10 p-3 text-[13px]/20px #E6E8F0 caret #8B5CF6 selection violet`.

**Fonctionnalités incluses** :
- `Tab / Shift+Tab` indent/dedent (tabSize 2)
- `Enter` auto-indent + extra sur `{ [ (` en JSON/XML/GraphQL
- Auto-close `{ } [ ] " '` en JSON/GraphQL
- `Shift+Alt+F` → `onFormat()`
- `language: json | xml | graphql | text | form-data | urlencoded | none`
- `spellCheck false`, `wrap off`, `tabSize` CSS var `--code-font-size`

```tsx
<CodeEditor value={body} onChange={setBody} language="json" onFormat={prettify} />
```

### 8.4 KeyValueEditor — `src/renderer/src/components/ui/KeyValueEditor.tsx:16`

Grille `28px 1fr 1fr 36px` pour params/headers.

Props: `items: KeyValuePair[]`, `onChange`, `keyPlaceholder`, `valuePlaceholder`, `keySuggestions: string[]` (datalist autocomplete).

Features:
- Header sticky `bg #121215 border #232329` + checkbox *select all* (indeterminate)
- Empty state dashed + `Add key` Button
- Row `bg #0E0E10 border #232329 hover #16161A/#2E2E36`, disabled `opacity 0.72`
- Champs mono `h-32px bg #121215`, focus violet + shadow
- Bouton `Sparkles` génère valeur aléatoire via `seed-generator` + toast
- Bouton `Trash` hover red `rgba(239,68,68,0.10)`

```tsx
<KeyValueEditor items={headers} onChange={setHeaders} keyPlaceholder="Header" keySuggestions={KNOWN_HEADERS} />
```

### 8.5 Tabs — `src/renderer/src/components/ui/Tabs.tsx:18`

Context `value/onValueChange`.

```tsx
<Tabs value={tab} onValueChange={setTab}>
  <TabsList><TabsTrigger value="headers">Headers</TabsTrigger></TabsList>
  <TabsContent value="headers">...</TabsContent>
</Tabs>
// TabsList: border-b #232329 bg #070709 flex overflow-x-auto
// TabsTrigger active: border-b-2 #8B5CF6 bg rgba(139,92,246,0.08) text #E6E8F0 weight 600
// Idle: #9FA3B5 hover #E6E8F0 + bg #121215
```

### 8.6 Dropdown — `src/renderer/src/components/ui/Dropdown.tsx:24`

```tsx
<Dropdown trigger={<Button>Options</Button>} items={[{label:'Edit', value:'edit', onSelect:...}]} />
<Dropdown groups={[{label:'Actions', items:[...]}]} align="right" />
// Menu: absolute min-w 300px max-h min(340px,52vh) bg #121215 border #232329 rounded 0
// Ombre: 0 8px 32px rgba(0,0,0,0.45) + inset 0 1px rgba(255,255,255,0.03)
// Item: px-3 py-2 text-sm #E6E8F0 hover #16161A active rgba(139,92,246,0.10)
// Flip auto dropUp si spaceBelow < 280
```

### 8.7 Modal — `src/renderer/src/components/ui/Modal.tsx:14`

```tsx
<Modal open={open} onClose={close} title="New Collection" footer={<><Button variant="ghost">Cancel</Button><Button variant="primary">Create</Button></>}>
  ...
</Modal>
// Overlay: fixed inset-0 backdrop-blur 2px bg rgba(7,7,9,0.78)
// Panel: max-w 520px max-h 85vh bg #121215 border #232329 shadow 0 24px 48px rgba(0,0,0,0.5) animate-fadeUp
// Header: px-6 py-4 border-b #232329 title 17px/600 -0.02em #E6E8F0 + close button
// Body: px-6 py-6 (24px), Footer: border-t #232329 bg #0E0E10 justify-end gap-2
// ESC ferme, click overlay ferme
```

### 8.8 Toast / Toaster — `src/renderer/src/components/ui/Toast.tsx:4`

```tsx
useNotificationStore.getState().addToast({ variant:'success', title:'Saved', description:'Collection created' })
// Variants: success #10B981, error #EF4444, warning #FBBF24, info #8B5CF6
// Container: fixed bottom-0 right-0 z-100 max-w 420px gap-2 p-4
// Toast: flex bg #121212 border #262626 borderLeft 2px variant px-4 py-3, icône + title 13px + desc 12px #8F909E
```

### 8.9 Autres composants (patterns récurrents)

| Composant | Fichier | Tokens clés | Usage |
|---|---|---|---|
| **Header** | `layout/Header.tsx` | `h 10px bg #070709 border #232329 gradient` | Titre page + count + actions |
| **Sidebar** | `layout/Sidebar.tsx` | `w 228px bg #0E0E10 border #232329, active bg rgba(139,92,246,0.10) borderLeft #8B5CF6, inactive #7A7F93 hover #E6E8F0 bg #16161A` | Nav 10 items |
| **Titlebar** | `layout/Titlebar.tsx` | `h 36px bg #070709 border #232329, win controls 46px hover #16161A danger #EF4444, data-tauri-drag-region` | Fenêtre Tauri frameless `tauri.conf.json:decorations false` |
| **MainLayout** | `layout/MainLayout.tsx` | `bg #070709 radial-gradient violet 0.035 + glow` | Shell + zenMode |
| **Cards** | `cards/*` | `card-spotlight border #232329 bg #121215 hover #2E2E36 shadow` | `ApiCard`, `RequestCard`, `EnvironmentCard` |
| **CollectionTree** | `collections/CollectionTree.tsx` | `folder/request rows, hover bg #121215` | Collections page |
| **ScannerPanel** | `route-scanner/*` | `bg #070709 border #232329, progress amber, diff amber bg` | Route Scanner |
| **FlowCanvas** | `flow/FlowCanvas.tsx` | `nodes #121215, edges blue #4d9fff / amber #ffb224 / violet #8B5CF6, minimap #070709` | Connection Flow (menu retiré 0.1.1) |
| **ResponseViewer** | `response/*` | `JsonTree, HtmlPreview, HeadersView, bg #0E0E10` | Résultat requête |
| **GitPanel** | `git/GitPanel.tsx` | `diff pre bg #070709 border max-h 48 overflow-auto` | Git diff |

---

## 9. Utilitaires CSS — Fonctionnalités à réutiliser

| Classe | Définition `globals.css` | Effet | Exemple |
|---|---|---|---|
| `.skeleton` | `bg #18181E border #232329 + ::after gradient shimmer 1.8s` | placeholder chargement | `<div class="h-10 skeleton"/>` |
| `.animate-fadeUp` | `fadeUp 0.5s ease-spring` | entrée progressive (stagger `idx*32ms`) | `Collections.tsx:153` |
| `.card-spotlight` | `::before gradient blanc 0.06 hover opacity 1` | illumination carte | `ApiCard.tsx` |
| `.radius-soft` / `.radius-soft-lg` | `border-radius 8px/12px !important` | adoucir carte/modal | `Modal` avec `className="radius-soft"` |
| `.tabular-nums` | `font-variant-numeric tabular-nums` | nombres alignés | `KeyValueEditor value`, `Button counts` |
| `.avatar` | `border-radius 9999px !important` | avatar rond | `Sidebar user` (retiré) |
| `.skip-link` | `focus: bg #8B5CF6 left 16px top 16px` | accessibilité clavier | `MainLayout.tsx` |
| `.btn-press` | `active scale 0.98 translateY 0.5px` | feedback fort | alternative à `active:scale-95` |
| `::selection` | `bg rgba(139,92,246,0.35) color #fff` | sélection texte | global |
| `scrollbar` | thin 6px rounded | scroll discret | global |

---

## 10. Comment utiliser — Recettes

### Carte standard
```tsx
<div className="card-spotlight border bg-[#121215] p-[14px] hover:border-[#2E2E36]"
     style={{ borderColor:'#232329', boxShadow:'0 4px 16px rgba(0,0,0,0.35)' }}>
  <h3 className="text-[13px] font-semibold tracking-[-0.02em] text-[#E6E8F0]">Titre</h3>
  <p className="text-xs text-[#7A7F93]">Description</p>
</div>
```

### Input + Button barre d'action
```tsx
<div className="flex gap-2">
  <input className="h-[40px] flex-1 border bg-[#121215] px-3 text-sm text-[#E6E8F0] placeholder:text-[#5A5E6E]"
         style={{ borderColor:'#232329', borderRadius:'0px' }} placeholder="https://api.example.com" />
  <Button variant="primary">Send</Button>
</div>
```

### Badge méthode HTTP
```tsx
<span className="px-2 py-1 font-mono text-xs" style={{ background:'var(--method-get)', color:'white' }}>GET</span>
<span style={{ color:'var(--method-post)' }}>POST</span>
```

### Variables inline (recommandé pour rester dans le système)
```tsx
<div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', color:'var(--text-primary)' }}>
```

### Respect dark-only
Ne jamais utiliser `bg-white` / `text-black`. Toujours `var(--bg-base)` / `var(--text-primary)` ou `api-*`. Le fichier `index.html:2` force `<html class="dark">`.

---

## 11. Ombres & Élévation

Pas de `shadow-lg` Tailwind par défaut. Utiliser :

```css
/* Carte */
box-shadow: 0 4px 16px rgba(0,0,0,0.35)
/* Dropdown/Modal */
box-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)
/* Button primary */
box-shadow: 0 0 12px rgba(139,92,246,0.22) /* hover 16px 0.32 */
```

Suppression : `.shadow-none-override { box-shadow:none !important }` `globals.css:275`.

---

## 12. Responsive & Accessibilité

- **Min window** `1280×800` (`tauri.conf.json`), défaut `1440×900`. Desktop-first, multi-pane, command palette `Ctrl+K`.
- **Focus** toujours visible (`:focus-visible` violet). `skip-link` pour clavier.
- **Reduced motion** : coupe tout (`prefers-reduced-motion: reduce` `globals.css:383`).
- **Contraste** : texte `#E6E8F0` sur `#070709` = 14.6:1.

---

## 13. Fichiers de référence rapide

| Chemin | Rôle |
|---|---|
| `src/renderer/src/styles/globals.css` | **Source unique** — 390 lignes, toutes les variables + resets |
| `src/renderer/tailwind.config.cjs` | Tokens Tailwind `api-*` + aliases `var()` |
| `src/renderer/src/components/ui/Button.tsx` | 4 variants, 2 sizes |
| `src/renderer/src/components/ui/Input.tsx` | input 40px |
| `src/renderer/src/components/ui/CodeEditor.tsx` | éditeur code |
| `src/renderer/src/components/ui/Modal.tsx` | dialog 520px |
| `src/renderer/src/components/ui/Tabs.tsx` | onglets violet |
| `src/renderer/src/components/ui/Dropdown.tsx` | menu 300px flip |
| `src/renderer/src/components/ui/Toast.tsx` | toasts |
| `src/renderer/src/components/ui/KeyValueEditor.tsx` | grille params |
| `src/renderer/index.html` | `theme-color #070709`, `<html dark>` |

> **Prochaine étape** : pour ajouter une couleur, ajoute une var dans `globals.css:60` puis un alias dans `tailwind.config.cjs:34` — jamais de hex en dur hors composant.

