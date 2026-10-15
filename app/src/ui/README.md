# Pohyb UI kit („Klinik“)

React primitives + CSS for the approved design *Varianta 1 · Klinik*. Calm, clinical: hairline borders, 11 px uppercase section labels, 14 px body, tabular numerals, one teal accent, no gradients, no coloured side stripes.

```ts
import './styles/index.css';            // once, in the app entry (tokens → base → components)
import { Button, Card, toast } from '../ui';
```

- Every colour is a CSS custom property; light on `:root`, dark via `prefers-color-scheme` or `<html data-theme="dark|light">`.
- Never write literal colours in screen CSS — use the tokens below.
- No `window.alert/confirm/prompt` (they do nothing in the host): use `ConfirmDialog` / `toast`.
- Icons: `<Icon name="…" />` only (inline stroke SVG, no emoji). Full list: `ICON_NAMES`.

## Tokens

| Group | Tokens |
|---|---|
| Surfaces | `--bg` (app) · `--surface` (cards, bars) · `--surface-raised` (dialogs, menus) · `--surface-subtle` (footers) · `--surface-muted` (past events) · `--surface-sunken` (search, off-hours) · `--surface-strong` (segmented track, chips) · `--surface-hover` |
| Borders | `--border` (hairline) · `--border-subtle` (table rows) · `--border-strong` (controls) · `--border-dashed` |
| Text | `--text` · `--text-secondary` · `--text-muted` (≥ 4.5:1) · `--text-faint` (decorative only) · `--inverse-bg/-fg` |
| Accent | `--accent` (#0B6E6E) · `--accent-strong` (hover) · `--accent-soft` (active nav) · `--accent-subtle` (selected rows) · `--accent-border` · `--accent-fg` (accent text/links) · `--on-accent` (text on solid accent) · `--focus-ring` |
| Semantic | `--success`, `--warning`, `--danger`, `--info` (fills, dots, icons) each with `-soft` (bg), `-fg` (text on surface/soft), `-border`, `-muted` (chart fills); `--danger-strong`, `--on-danger` |
| Tones | `--tone-{teal,sand,blue,violet,slate,rose,olive}-{bg,border,fg,solid}` — `fg` is text on `bg`; `solid` is for dots, legends, bars |
| Data / calendar | `--chart-grid/-axis/-target/-secondary/-tertiary` · `--heat-0…5` · `--grid-line`, `--grid-line-minor`, `--offhours`, `--hatch-a/-b` |
| Effects | `--shadow-xs/-sm/-md/-lg` · `--backdrop` |
| Type | `--font-sans`; `--text-2xs` 10.5 · `-xs` 11 · `-sm` 12 · `-note` 12.5 · `-md` 13 · `-base` 14 · `-lg` 16 · `-xl` 17 · `-2xl` 20 · `-3xl` 22 · `-4xl` 26 · `-5xl` 28 (each with `--leading-*`); `--weight-regular/medium/semibold/bold`; `--tracking-eyebrow` .06em, `-tight`, `-tighter`, `-brand` |
| Spacing | `--space-0-5` 2 · `-1` 4 · `-1-5` 6 · `-2` 8 · `-2-5` 10 · `-3` 12 · `-3-5` 14 · `-4` 16 · `-5` 20 · `-6` 24 · `-7` 28 · `-8` 32 · `-10` 40 · `-12` 48 · `-16` 64 |
| Radius | `--radius-xs` 2 · `-sm` 4 · `-md` 6 (events) · `-lg` 8 (controls) · `-xl` 10 (cards) · `-2xl` 14 (dialogs) · `-full` |
| Sizes / motion / layers | `--control-h-sm/md/lg` 32/36/44 · `--sidebar-w` 232 · `--topbar-h` 56 · `--drawer-w-*` · `--dialog-w-*` · `--duration-fast/base/slow` · `--ease-standard/-out` · `--z-sticky/-shell/-overlay/-popover/-toast` |

## Utility classes (base.css)

`.page` (content padding inside AppShell, 20/24 px; 16 px on phones) · `.stack` + `.stack-xs|sm|md|lg|xl` · `.row` + `.row-xs|sm|md|lg`, `.row--nowrap|between|end|start|baseline` · `.spacer` · `.grid` (auto-fit, `--grid-min`, `--grid-gap`) · `.split` > `.split__main` + `.split__aside` (aside wraps under on narrow screens) · `.eyebrow` · `.title-xl|lg|md|sm` · `.text-body|small|note|caption|micro` · `.muted` `.secondary` `.text-accent|success|warning|danger|info` · `.fw-medium|semibold` · `.tnum` · `.nowrap` `.truncate` · `.visually-hidden` · `.divider` `.divider-v` · `.statline` (inline stats, `<strong>` = value) · `.link` (button that looks like a link) · `.legend` · `.kpi-grid`.

## Components

### Actions
| Component | Props | Usage |
|---|---|---|
| `Button` | `variant` primary · secondary (default) · ghost · subtle · soft („Omluvit“) · danger (solid) · danger-secondary („Zrušit“); `size` sm 32 · md 36 · lg 44 (48 on phones); `icon`, `iconRight`, `full`, `loading`; native button props (`type` defaults to `"button"`) | `<Button variant="primary" icon="plus">Nová rezervace</Button>` |
| `IconButton` | `icon`, **`label`** (aria-label + tooltip), `variant` ghost (default) · outline (top bar) · secondary · subtle · primary · danger; `size`; `dot` | `<IconButton icon="bell" label="Oznámení" variant="outline" dot />` |
| `Menu` | `trigger`, `items: ({id,label,icon?,onSelect?,danger?,disabled?,hint?} \| {type:'separator'} \| {type:'label',label})[]`, `align` start/end, `label`; `content` (node or `close => node`) turns it into a small form popover that closes on submit | `<Menu trigger={<IconButton icon="more" label="Další akce" />} items={[…]} />` |
| `Popover` | `trigger`, `label`, `children` (node or `close => node`), `align`, `width`, `open`/`onOpenChange`, `flush`, `closeOnSubmit` | filter panels, quick forms |
| `PeriodNav` | `label`, `onPrev`, `onNext`, `prevLabel`, `nextLabel` | `<PeriodNav label="Září 2026" onPrev={…} onNext={…} />` |

`Menu`/`Popover` triggers: pass our `Button`/`IconButton` or a native `<button>`; any other node (icon, text, span) is wrapped in a real `<button>` named by `label`. Keyboard: ↑↓ Home End, typeahead, Enter/Space, Esc returns focus, Tab closes.

### Status & labels
| Component | Props | Usage |
|---|---|---|
| `Badge` | `tone` neutral · accent · success · warning · danger · info · any `Tone`; `size` sm (18 px) · md (22 px); `dot` (true / 'circle' / 'ring' / 'square'); `icon`; `outline` (client tag look); `plain` (dot + text, no fill) | `<Badge tone="success">Doporučeno</Badge>` |
| `StatusPill` | `status: BookingStatus`, `label?` (e.g. „Nedostavila se“), `appearance` pill · plain | `<StatusPill status="late_cancelled" />` |
| `BOOKING_STATUS_META` | `{label, tone, shape}` per status (filters, legends) | Potvrzeno · Proběhlo · Nedostavil/a se · Zrušeno · Pozdní storno · Omluveno · Zrušeno klinikou |
| `Kbd` | children | `<Kbd>⌘K</Kbd>` |
| `Swatch` | `tone` (Tone · accent · neutral · break · free), `variant` soft · solid | `<div className="legend"><Swatch tone="teal">Koučink</Swatch>…</div>` |

Status shapes never rely on colour alone: circle = confirmed/done, ring = cancelled/excused, square = penalty (late cancel, no-show).

### Containers & navigation
| Component | Props | Usage |
|---|---|---|
| `Card` | `as` div/section/article/aside/li, `padding` none · sm · md (default) · lg, `interactive`; children stack with 12 px gap | `<Card as="section">…</Card>` |
| `CardHeader` | `title`, `subtitle`, `eyebrow`, `meta` (right, muted), `actions`, `icon`, `size` label (11 px uppercase, default) · title (16 px), `divided` (44 px bar for `padding="none"` cards), `headingLevel` | `<CardHeader title="Nadcházející (3)" actions={<button className="link">Otevřít v kalendáři</button>} />` |
| `.card__body`, `.card__footer` | classes for padded regions inside `padding="none"` cards | |
| `Tabs` | `items: {id,label,count?,disabled?}[]`, `value`, `onChange`, `aria-label`, `idPrefix`, `bordered` | `<Tabs items={…} value={tab} onChange={setTab} idPrefix="client" />` |
| `TabPanel` | `idPrefix`, `id` | `<TabPanel idPrefix="client" id={tab}>…</TabPanel>` |
| `Segmented` | `options: {value,label,icon?,hideLabel?,disabled?}[]`, `value`, `onChange`, **`aria-label`**, `size` sm 26 · md 28 · lg 32, `full` | `<Segmented aria-label="Zobrazení" value={v} onChange={setV} options={…} />` |

### Forms
All controls share one 36 px frame (44 px on phones, 16 px text on touch devices so iOS does not zoom). `className`/`style` on `Input`, `Select`, `NumberInput` go to the frame.

| Component | Props | Usage |
|---|---|---|
| `Field` | `label`, `children` (**one** control — gets id, aria-describedby, aria-invalid), `hint`, `error`, `htmlFor`, `inline` (label column; stacks on phones), `labelWidth`, `optional` („(nepovinné)“) | `<Field label="Předmět" error={err}><Input value={v} onValueChange={setV} /></Field>` |
| `Input` | native input props + `prefixIcon`, `prefix`, `suffix` („Kč“, „h“, `<Kbd>`), `size`, `sunken`, `invalid`, `onValueChange` | search: `<Input sunken prefixIcon="search" suffix={<Kbd>⌘K</Kbd>} aria-label="Hledat" />` |
| `NumberInput` | `value`, `onChange(number)`, `min`, `max`, `step`, `suffix`, `size`, `invalid`, `stepper` | `<NumberInput value={h} onChange={setH} min={0} max={72} suffix="h" />` — Czech decimal comma, clamps on blur, ↑↓ (Shift ×10) |
| `Select` | `options: {value,label,disabled?}[]`, `placeholder`, `prefix` („Terapeut:“), `inline`, `size`, `sunken`, `invalid`, `onValueChange` | `<Select inline prefix="Terapeut:" value={t} onValueChange={setT} options={…} />` |
| `Textarea` | native props + `invalid`, `onValueChange` | |
| `Checkbox` | `label`, `description`, `checked`, `onChange(checked)`, `indeterminate` | |
| `Switch` | `checked`, `onChange(checked)`, `label`, `description`, `labelPosition` start (text left, default) · end | automation lists |
| `RadioCards` | `options: {value,title,description?,badge?,aside?,disabled?}[]`, `value`, `onChange`, `legend` or `aria-label`, `columns` | cancel / excuse / reschedule choice |
| `ChoiceChips` | `options: {value,label,ariaLabel?,disabled?}[]`, `value`, `onChange`, **`aria-label`**, `shape` pill · tile, `size` md · lg, `columns` | reasons; time slots: `shape="tile" size="lg" columns={4}` |
| `DayStrip` | `days: {value,dow,day,sub?,label?,disabled?}[]`, `value`, `onChange`, **`aria-label`** | mobile day picker |

### Overlays (portal, focus moves in and returns, Esc closes only the top layer, scroll lock)
| Component | Props | Usage |
|---|---|---|
| `Dialog` | `open`, `onClose`, `title`, `description`, `size` sm 400 · md 520 · lg 720, `footer`, `initialFocus`, `dismissible` | first field in the body (or `[data-autofocus]`) gets focus |
| `Drawer` | Dialog props + `headerActions`, `side` right · left, `flush`, **`inline`** (docked, non-modal, in-layout — the calendar detail column); size sm 340 · md 420 · lg 560 | right drawer = bottom sheet on phones |
| `ConfirmDialog` | `open`, `onClose`, `title`, `message`, `children`, `confirmLabel`, `cancelLabel` (default „Zpět“), `tone` danger · primary, `onConfirm` (may return a promise → spinner, closes on resolve, stays open on reject), `confirmDisabled` | `<ConfirmDialog tone="danger" title="Zrušit rezervaci?" confirmLabel="Zrušit rezervaci" … />` |

### Feedback
| Component | Props | Usage |
|---|---|---|
| `Toaster` + `toast()` | mount `<Toaster />` once; `toast(message, {tone, description, duration, action})`, `toast.success/error/warning/info`, `toast.dismiss(id?)`; 4 s, pauses on hover, polite live region | `toast('Uloženo', { tone: 'success' })` |
| `Callout` | `tone` neutral · accent · success · warning · danger · info, `title` (uppercase, tone colour), `icon` (null hides), `actions` | `<Callout tone="warning" title="Storno teď">…</Callout>` |
| `Banner` | `tone` warning (default) · accent · info · danger · inverse, `icon`, `actions` | AppShell `banner` slot (test mode) |
| `EmptyState` | `title`, `text`, `icon`, `action`, `compact` | |
| `Skeleton` | `width`, `height`, `radius`, `circle`, `lines` | |
| `Spinner` | `size`, `label` (announced) | |

### Data display
| Component | Props | Usage |
|---|---|---|
| `Avatar` | `name` (initials derived, titles skipped) or `initials`, `tone` (Tone · neutral · accent), `size` xs 22 · sm 32 · md 40 · lg 56, `labelled` | `<Avatar name="Mgr. Tereza Malá" tone="teal" />` |
| `AvatarStack` | `people: {name,initials?,tone?}[]`, `max`, `size`, `label` | waitlist |
| `KpiTile` | `label`, `value`, `delta: {value, direction up · down · flat, good}`, `hint`, `icon`, `children` | `<KpiTile label="Tržby" value="412 300 Kč" delta={{ value: '+6,1 %', direction: 'up', good: true }} hint="vs. srpen" />` |
| `Progress` | `value`, `max`, `tone`, `size` xs 3 · sm 4 · md 8 · lg 14, `target` (marker), `showValue`, `segments` (discrete), `label` | `<Progress value={68} showValue label="Obsazenost" />` |
| `StackedBar` | `segments: {value,tone,label}[]`, `cells` (one cell per entry), `size`, `legend`, `label`; tones: accent · accent-hatched · neutral · neutral-strong · empty · semantic · Tone | permanentka: `<StackedBar cells segments={[{value:4,tone:'neutral',label:'využité'},{value:2,tone:'accent-hatched',label:'rezervované'},{value:4,tone:'accent',label:'volné'}]} />` |
| `DescriptionList` | `items: {term,detail,id?}[]`, `termWidth` (84), `plain`, `stacked` | booking drawer rows |
| `Table` | `minWidth`, `maxHeight` (enables sticky header), `density`, `hover`, `caption`; mark numeric cells `className="num"`, selected rows `is-selected` | wraps in its own horizontal scroller |

### Calendar
| Component / class | Notes |
|---|---|
| `EventBlock` | `tone`, `variant` default · active · completed · no_show · cancelled · free · released · break, `density` xs 15 min · sm 30 · md 45 (default) · lg 60 · xl 90+, `title`, `meta`, `footer`, `icon`, `selected` (aria-pressed), `style` (absolute top/height from the grid). `break` renders a non-interactive div |
| `EventStatus` (`tone` accent · muted · danger), `EventChip` (neutral · warning · danger), `EventSeats` (`taken`, `capacity`), `EventProgress` (`value` 0–1) | footer helpers |
| `.cal-line` / `.cal-line--hour`, `.cal-offhours`, `.cal-hour-label`, `.cal-now-line`, `.cal-now-badge` | grid primitives (position them absolutely) |

### Layout
| Component | Props | Usage |
|---|---|---|
| `AppShell` | `nav: {id,label,icon,count?,group?}[]`, `active`, `onNavigate(id)`, `topbar`, `sidebarFooter`, `banner`, `brand`, `children` | sidebar 232 px; under 960 px a 52 px bar with menu button opens the nav as a left sheet. The main column scrolls (top bar sticky on desktop) and resets to top when `active` changes. Wrap page content in `<div className="page">`. A single wrapper passed as `topbar` stretches to fill |
| `ShellUser` | `name`, `role`, `initials`, `tone`, `actions` | sidebar footer |
| `Wordmark` | `size` md · sm | „pohyb.“ |
| `PageHeader` | `title`, `subtitle`, `actions`, `breadcrumbs`, `onBack` (+`backLabel`), `compact` | `<PageHeader title="Statistiky" actions={…} />` |
| `Breadcrumbs` | `items: {label, onClick?, href?}[]` (last = current) | top bar of detail screens |
| `ActionBar` | `summary`, `children` (buttons share the row) | sticky mobile CTA area |
