import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Avatar, type AvatarTone } from './Avatar';
import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';
import { Portal, useModal } from './overlay';
import { cx, formatNumber } from './utils';

export interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  /** Right-aligned count („1 386“); numbers are formatted with Czech separators. */
  count?: number | string;
  /** Optional group heading; consecutive items with the same group share it. */
  group?: string;
}

export interface AppShellProps {
  nav: NavItem[];
  active: string;
  onNavigate: (id: string) => void;
  /** Content of the 56 px top bar (title, filters, search, primary action). Wraps on small screens. */
  topbar?: ReactNode;
  /** Bottom of the sidebar, typically <ShellUser … />. */
  sidebarFooter?: ReactNode;
  /** Full-width strip above everything, e.g. <Banner>Testovací režim…</Banner>. */
  banner?: ReactNode;
  /** Replaces the default „pohyb.“ wordmark + descriptor. */
  brand?: ReactNode;
  children: ReactNode;
}

/** The „pohyb.“ wordmark with the accent full stop. */
export function Wordmark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span className={cx('wordmark', size === 'sm' && 'wordmark--sm')}>
      pohyb<span className="wordmark__dot">.</span>
    </span>
  );
}

function DefaultBrand() {
  return (
    <div className="shell__brand">
      <Wordmark />
      <span className="shell__tagline">fyzioterapie · trénink · masáže</span>
    </div>
  );
}

function NavList({
  nav,
  active,
  onNavigate,
}: {
  nav: NavItem[];
  active: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <div className="nav">
      {nav.map((item, i) => {
        const showGroup = item.group != null && item.group !== nav[i - 1]?.group;
        return (
          <Fragment key={item.id}>
            {showGroup && <div className="nav__group-label">{item.group}</div>}
            <button
              type="button"
              className="nav__item"
              aria-current={item.id === active ? 'page' : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <Icon name={item.icon} size={18} />
              <span className="nav__label">{item.label}</span>
              {item.count != null && (
                <span className="nav__count">
                  {typeof item.count === 'number' ? formatNumber(item.count) : item.count}
                </span>
              )}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

function NavSheet({
  open,
  onClose,
  id,
  children,
}: {
  open: boolean;
  onClose: () => void;
  id: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { onKeyDown, onBackdropMouseDown } = useModal(open, { panelRef, onClose });
  if (!open) return null;
  return (
    <Portal>
      <div className="overlay overlay--drawer overlay--left">
        <div className="overlay__backdrop" aria-hidden="true" onMouseDown={onBackdropMouseDown} />
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          tabIndex={-1}
          className="drawer drawer--left"
          onKeyDown={onKeyDown}
        >
          <div className="drawer__body drawer__body--flush" data-overlay-body="">
            {children}
          </div>
        </div>
      </div>
    </Portal>
  );
}

/**
 * Admin layout: 232 px sidebar (wordmark, nav, footer) + main column with a
 * sticky top bar and scrollable content. Under 960 px the sidebar collapses
 * into a top bar with a menu button that opens the nav in a side sheet.
 */
export function AppShell({
  nav,
  active,
  onNavigate,
  topbar,
  sidebarFooter,
  banner,
  brand,
  children,
}: AppShellProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const sheetId = useId();
  const contentId = useId();
  const activeItem = nav.find((item) => item.id === active);

  // Each page starts at the top.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [active]);

  // Close the sheet when the viewport grows back to the desktop layout.
  useEffect(() => {
    const query = window.matchMedia('(min-width: 960px)');
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setSheetOpen(false);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const navigate = (id: string) => {
    setSheetOpen(false);
    onNavigate(id);
  };

  const skipToContent = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    contentRef.current?.focus();
  };

  return (
    <div className="shell">
      <a className="skip-link" href={`#${contentId}`} onClick={skipToContent}>
        Přeskočit na obsah
      </a>
      {banner != null && <div className="shell__banner">{banner}</div>}
      <div className="shell__body">
        <aside className="shell__sidebar">
          {brand ?? <DefaultBrand />}
          <nav aria-label="Hlavní navigace">
            <NavList nav={nav} active={active} onNavigate={navigate} />
          </nav>
          {sidebarFooter != null && <div className="shell__footer">{sidebarFooter}</div>}
        </aside>

        <div className="shell__mobilebar">
          <IconButton
            icon="menu"
            label="Otevřít menu"
            onClick={() => setSheetOpen(true)}
            aria-expanded={sheetOpen}
            aria-controls={sheetOpen ? sheetId : undefined}
          />
          <Wordmark size="sm" />
          <span className="shell__mobilebar-title">{activeItem?.label}</span>
        </div>

        <div ref={mainRef} className="shell__main">
          {topbar != null && <header className="shell__topbar">{topbar}</header>}
          <main ref={contentRef} id={contentId} tabIndex={-1} className="shell__content">
            {children}
          </main>
        </div>
      </div>

      <NavSheet open={sheetOpen} onClose={() => setSheetOpen(false)} id={sheetId}>
        <div className="navsheet">
          <div className="navsheet__head">
            {brand ?? <DefaultBrand />}
            <IconButton icon="x" label="Zavřít menu" size="sm" onClick={() => setSheetOpen(false)} />
          </div>
          <nav aria-label="Hlavní navigace">
            <NavList nav={nav} active={active} onNavigate={navigate} />
          </nav>
          {sidebarFooter != null && <div className="shell__footer">{sidebarFooter}</div>}
        </div>
      </NavSheet>
    </div>
  );
}

export interface ShellUserProps {
  name: string;
  /** e.g. „majitelka“, „recepce“. */
  role?: string;
  initials?: string;
  tone?: AvatarTone;
  /** Trailing control, e.g. a <Menu> with an IconButton "more". */
  actions?: ReactNode;
}

/** Signed-in user row for the sidebar footer. */
export function ShellUser({ name, role, initials, tone = 'teal', actions }: ShellUserProps) {
  return (
    <div className="shell-user">
      <Avatar name={name} initials={initials} tone={tone} size="sm" />
      <div className="shell-user__text">
        <span className="shell-user__name">{name}</span>
        {role && <span className="shell-user__role">{role}</span>}
      </div>
      {actions}
    </div>
  );
}
