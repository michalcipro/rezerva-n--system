import { useMemo, useState } from 'react';
import type { Category, GroupTemplate, Service, Therapist, Weekday } from '../../domain/types';
import { upsertCategory, upsertService } from '../../engine/commands';
import { countLabel, formatDayShort, formatDuration, formatMoney, formatPercent, formatTime } from '../../engine/format';
import { getCategory, getRoom, getService, getTherapist, therapistShort } from '../../engine/selectors';
import { dateOf } from '../../engine/time';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  IconButton,
  Input,
  Menu,
  PageHeader,
  Progress,
  Switch,
  Table,
  Tabs,
  type MenuEntry,
} from '../../ui';
import { ToneDot } from '../../components/domain';
import { CategoryDialog } from './CategoryDialog';
import { GroupTemplateEditor, newGroupTemplate } from './GroupTemplateEditor';
import { ServiceEditor } from './ServiceEditor';
import { WEEKDAYS, byOrder, cx, groupOccupancy, newServiceDraft, nextSessions, templateEnd, weekdayName } from './helpers';
import { TherapistStack } from './shared';

type Tab = 'catalog' | 'schedule';

const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Pořadí „mezi sousedy" – jediná změna místo přečíslování celého seznamu. */
function orderBetween(list: { order: number }[], index: number, dir: -1 | 1): number | null {
  const target = index + dir;
  if (target < 0 || target >= list.length) return null;
  const beyond = list[target + dir];
  const anchor = list[target].order;
  if (!beyond) return anchor + dir;
  return (anchor + beyond.order) / 2;
}

export function ServicesScreen(): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const [tab, setTab] = useState<Tab>('catalog');
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [editService, setEditService] = useState<Service | null>(null);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [editTemplate, setEditTemplate] = useState<GroupTemplate | null>(null);

  const categories = useMemo(() => [...clinic.categories].sort(byOrder), [clinic.categories]);
  const services = useMemo(() => [...clinic.services].sort(byOrder), [clinic.services]);
  const activeCount = services.filter((s) => s.active).length;
  const lessonsPerWeek = clinic.groupTemplates.filter((t) => t.active && (!t.validTo || t.validTo >= dateOf(now))).length;

  const firstCategoryId = categories[0]?.id ?? '';
  const openNewService = (categoryId = firstCategoryId, kind: 'individual' | 'group' = 'individual'): void =>
    setEditService(newServiceDraft(categoryId, kind));
  const openNewCategory = (): void => setEditCategory({ id: '', name: '', tone: 'teal', order: categories.length });
  const openNewLesson = (weekday: Weekday = 0): void => setEditTemplate(newGroupTemplate(clinic, weekday, dateOf(now)));

  const visible = (s: Service): boolean => {
    if (!showInactive && !s.active) return false;
    const q = norm(query.trim());
    if (!q) return true;
    return norm(s.name).includes(q) || norm(s.description).includes(q);
  };

  const moveCategory = (index: number, dir: -1 | 1): void => {
    const order = orderBetween(categories, index, dir);
    if (order === null) return;
    run(upsertCategory, { ...categories[index], order }, { quiet: true });
  };

  return (
    <div className="page set-page">
      <PageHeader
        title="Služby a ceník"
        subtitle={`${countLabel(activeCount, ['aktivní služba', 'aktivní služby', 'aktivních služeb'])} v ${countLabel(categories.length, ['kategorii', 'kategoriích', 'kategoriích'])} · ${countLabel(lessonsPerWeek, ['skupinová lekce', 'skupinové lekce', 'skupinových lekcí'])} týdně`}
        actions={
          tab === 'catalog' ? (
            <>
              <Button variant="secondary" icon="layers" onClick={openNewCategory}>
                Nová kategorie
              </Button>
              <Button variant="primary" icon="plus" onClick={() => openNewService()} disabled={!categories.length}>
                Nová služba
              </Button>
            </>
          ) : (
            <Button variant="primary" icon="plus" onClick={() => openNewLesson()}>
              Nová lekce
            </Button>
          )
        }
      />

      <Tabs<Tab>
        aria-label="Služby a ceník"
        idPrefix="set-svc"
        bordered
        value={tab}
        onChange={setTab}
        items={[
          { id: 'catalog', label: 'Ceník služeb', count: services.length },
          { id: 'schedule', label: 'Rozvrh skupinových lekcí', count: clinic.groupTemplates.length },
        ]}
      />

      {tab === 'catalog' ? (
        <div role="tabpanel" id="set-svc-panel-catalog" aria-labelledby="set-svc-tab-catalog" className="set-stack">
          <div className="set-toolbar">
            <Input
              className="set-toolbar__search"
              size="sm"
              prefixIcon="search"
              placeholder="Hledat službu"
              aria-label="Hledat službu"
              value={query}
              onValueChange={setQuery}
              type="search"
            />
            <Switch checked={showInactive} onChange={setShowInactive} label="Zobrazit skryté služby" labelPosition="end" />
          </div>

          {categories.length === 0 && (
            <Card>
              <EmptyState
                icon="layers"
                title="Ceník je zatím prázdný"
                text="Začněte kategorií (např. Fyzioterapie, Masáže) a pak do ní přidejte služby s délkou a cenou."
                action={
                  <Button variant="primary" icon="plus" onClick={openNewCategory}>
                    Přidat první kategorii
                  </Button>
                }
              />
            </Card>
          )}

          {categories.map((cat, ci) => {
            const list = services.filter((s) => s.categoryId === cat.id);
            const shown = list.filter(visible);
            if (query.trim() && !shown.length) return null;
            return (
              <CategoryBlock
                key={cat.id}
                category={cat}
                all={list}
                shown={shown}
                therapists={clinic.therapists}
                isFirst={ci === 0}
                isLast={ci === categories.length - 1}
                onEditCategory={() => setEditCategory(cat)}
                onMoveCategory={(dir) => moveCategory(ci, dir)}
                onAdd={() => openNewService(cat.id, list.length > 0 && list.every((x) => x.kind === 'group') ? 'group' : 'individual')}
                onEdit={(s) => setEditService(s)}
                onDuplicate={(s) => setEditService({ ...s, id: '', name: `${s.name} (kopie)`, order: 0 })}
              />
            );
          })}

          <OrphanServices services={services.filter((s) => !getCategory(clinic, s.categoryId))} onEdit={setEditService} />

          {query.trim() && !services.some(visible) && (
            <Card>
              <EmptyState compact icon="search" title={`Žádná služba neodpovídá „${query.trim()}"`} text="Zkuste jiný výraz nebo zapněte zobrazení skrytých služeb." />
            </Card>
          )}
        </div>
      ) : (
        <div role="tabpanel" id="set-svc-panel-schedule" aria-labelledby="set-svc-tab-schedule">
          <GroupSchedule onEdit={setEditTemplate} onNew={openNewLesson} />
        </div>
      )}

      {editService && <ServiceEditor key={editService.id || 'new'} initial={editService} onClose={() => setEditService(null)} />}
      {editCategory && <CategoryDialog initial={editCategory} onClose={() => setEditCategory(null)} />}
      {editTemplate && (
        <GroupTemplateEditor
          initial={editTemplate}
          onClose={() => setEditTemplate(null)}
          onCreateService={() => {
            setEditTemplate(null);
            setTab('catalog');
            openNewService(categories.find((c) => clinic.services.some((s) => s.categoryId === c.id && s.kind === 'group'))?.id ?? firstCategoryId, 'group');
          }}
        />
      )}
    </div>
  );
}

/* Služby bez platné kategorie (např. po importu) – aby nezmizely z ceníku. */
function OrphanServices({ services: list, onEdit }: { services: Service[]; onEdit: (s: Service) => void }): JSX.Element | null {
  if (!list.length) return null;
  return (
    <Card padding="none" as="section" aria-label="Služby bez kategorie">
      <div className="set-cat__head">
        <Icon name="alert" size={16} className="text-warning" />
        <h2 className="set-cat__title">Bez kategorie</h2>
        <span className="set-cat__meta">Přiřaďte službám kategorii</span>
      </div>
      <ul className="set-plainlist">
        {list.map((s) => (
          <li key={s.id}>
            <button type="button" className="set-rowlink" onClick={() => onEdit(s)}>
              {s.name}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Jedna kategorie ceníku                                              */
/* ------------------------------------------------------------------ */

function CategoryBlock({
  category,
  all,
  shown,
  therapists,
  isFirst,
  isLast,
  onEditCategory,
  onMoveCategory,
  onAdd,
  onEdit,
  onDuplicate,
}: {
  category: Category;
  all: Service[];
  shown: Service[];
  therapists: Therapist[];
  isFirst: boolean;
  isLast: boolean;
  onEditCategory: () => void;
  onMoveCategory: (dir: -1 | 1) => void;
  onAdd: () => void;
  onEdit: (s: Service) => void;
  onDuplicate: (s: Service) => void;
}): JSX.Element {
  const run = useCommand();
  const headingId = `set-cat-${category.id}`;
  const activeCount = all.filter((s) => s.active).length;

  const toggleActive = (svc: Service, active: boolean): void => {
    run(upsertService, { ...svc, active }, {
      success: active ? `„${svc.name}" je znovu v nabídce` : `„${svc.name}" je skrytá – nově ji nelze rezervovat`,
    });
  };

  const move = (svc: Service, dir: -1 | 1): void => {
    const index = all.findIndex((s) => s.id === svc.id);
    const order = orderBetween(all, index, dir);
    if (order === null) return;
    run(upsertService, { ...svc, order }, { quiet: true });
  };

  const categoryMenu: MenuEntry[] = [
    { id: 'edit', label: 'Upravit kategorii', icon: 'edit', onSelect: onEditCategory },
    { id: 'up', label: 'Posunout výš', icon: 'arrowUp', disabled: isFirst, onSelect: () => onMoveCategory(-1) },
    { id: 'down', label: 'Posunout níž', icon: 'arrowDown', disabled: isLast, onSelect: () => onMoveCategory(1) },
  ];

  return (
    <Card as="section" padding="none" className="set-cat" aria-labelledby={headingId}>
      <div className="set-cat__head">
        <ToneDot tone={category.tone} />
        <h2 id={headingId} className="set-cat__title">
          {category.name}
        </h2>
        <span className="set-cat__meta">
          {all.length === activeCount
            ? countLabel(all.length, ['služba', 'služby', 'služeb'])
            : `${activeCount} z ${countLabel(all.length, ['služby', 'služeb', 'služeb'])} v nabídce`}
        </span>
        <span className="spacer" />
        <Button size="sm" variant="ghost" icon="plus" onClick={onAdd} aria-label={`Přidat službu do kategorie ${category.name}`}>
          Přidat službu
        </Button>
        <Menu label={`Kategorie ${category.name}`} trigger={<IconButton icon="more" size="sm" label={`Další akce – kategorie ${category.name}`} />} items={categoryMenu} />
      </div>

      {shown.length === 0 ? (
        <EmptyState
          compact
          icon="briefcase"
          title={all.length ? 'Všechny služby kategorie jsou skryté' : 'V kategorii zatím nejsou služby'}
          action={
            !all.length ? (
              <Button size="sm" variant="secondary" icon="plus" onClick={onAdd}>
                Přidat službu
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Table hover className="set-svc-table" caption={`Služby v kategorii ${category.name}`}>
            <thead>
              <tr>
                <th scope="col">Služba</th>
                <th scope="col" className="num">
                  Délka
                </th>
                <th scope="col" className="num">
                  Cena
                </th>
                <th scope="col" className="num set-col-md">
                  Rezerva
                </th>
                <th scope="col" className="set-col-md">
                  Typ
                </th>
                <th scope="col" className="set-col-lg">
                  Terapeuti
                </th>
                <th scope="col" className="set-col-md">
                  Online
                </th>
                <th scope="col">V nabídce</th>
                <th scope="col">
                  <span className="visually-hidden">Akce</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((svc) => {
                const index = all.findIndex((s) => s.id === svc.id);
                const people = svc.therapistIds.map((id) => therapists.find((t) => t.id === id)).filter((t): t is Therapist => !!t);
                const menu: MenuEntry[] = [
                  { id: 'edit', label: 'Upravit', icon: 'edit', onSelect: () => onEdit(svc) },
                  { id: 'dup', label: 'Vytvořit kopii', icon: 'copy', onSelect: () => onDuplicate(svc) },
                  { type: 'separator' },
                  { id: 'up', label: 'Posunout výš', icon: 'arrowUp', disabled: index <= 0, onSelect: () => move(svc, -1) },
                  { id: 'down', label: 'Posunout níž', icon: 'arrowDown', disabled: index >= all.length - 1, onSelect: () => move(svc, 1) },
                ];
                return (
                  <tr key={svc.id} className={cx(!svc.active && 'is-inactive')} data-clickable="" onClick={() => onEdit(svc)}>
                    <td className="set-svc-name">
                      <button
                        type="button"
                        className="set-rowlink"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(svc);
                        }}
                      >
                        {svc.name}
                      </button>
                      <span className="set-svc-sub">
                        {!svc.active && (
                          <Badge tone="neutral" size="sm">
                            Skrytá
                          </Badge>
                        )}
                        {svc.newClientsOnly && (
                          <Badge tone="info" size="sm">
                            Jen noví klienti
                          </Badge>
                        )}
                        {svc.remote && (
                          <Badge tone="neutral" size="sm" icon="video">
                            Videohovor
                          </Badge>
                        )}
                        {svc.description && <span className="set-svc-desc">{svc.description}</span>}
                      </span>
                    </td>
                    <td className="num">{formatDuration(svc.durationMin)}</td>
                    <td className="num set-strong">{formatMoney(svc.priceCzk)}</td>
                    <td className="num set-col-md muted">{svc.bufferMin ? `+${svc.bufferMin} min` : '—'}</td>
                    <td className="set-col-md nowrap">
                      {svc.kind === 'group' ? (
                        <span className="set-kind">
                          <Icon name="users" size={14} /> {countLabel(svc.capacity, ['místo', 'místa', 'míst'])}
                        </span>
                      ) : (
                        <span className="set-kind">
                          <Icon name="user" size={14} /> Individuální
                        </span>
                      )}
                    </td>
                    <td className="set-col-lg">
                      <TherapistStack therapists={people} />
                    </td>
                    <td className="set-col-md">
                      {svc.onlineBookable ? (
                        <Badge plain tone="success" dot>
                          Ano
                        </Badge>
                      ) : (
                        <Badge plain tone="neutral" dot="ring">
                          Jen recepce
                        </Badge>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <Switch checked={svc.active} onChange={(v) => toggleActive(svc, v)} aria-label={`${svc.name} – v nabídce`} />
                    </td>
                    <td className="set-cell-actions" onClick={(e) => e.stopPropagation()}>
                      <Menu label={`Akce – ${svc.name}`} trigger={<IconButton icon="more" size="sm" label={`Další akce – ${svc.name}`} />} items={menu} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
        </Table>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Rozvrh skupinových lekcí                                            */
/* ------------------------------------------------------------------ */

function GroupSchedule({ onEdit, onNew }: { onEdit: (t: GroupTemplate) => void; onNew: (wd: Weekday) => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const today = dateOf(now);
  const next = useMemo(() => nextSessions(clinic, now), [clinic, now]);
  const occ = useMemo(() => groupOccupancy(clinic, now), [clinic, now]);
  const [showEnded, setShowEnded] = useState(false);

  const isEnded = (t: GroupTemplate): boolean => !!t.validTo && t.validTo < today;
  const endedCount = clinic.groupTemplates.filter(isEnded).length;
  const templates = clinic.groupTemplates.filter((t) => showEnded || !isEnded(t));
  const byDay = WEEKDAYS.map((wd) => templates.filter((t) => t.weekday === wd).sort((a, b) => (a.start < b.start ? -1 : 1)));
  const seats = clinic.groupTemplates.filter((t) => t.active && !isEnded(t)).reduce((sum, t) => sum + t.capacity, 0);

  if (!clinic.groupTemplates.length) {
    return (
      <Card>
        <EmptyState
          icon="calendar"
          title="Rozvrh lekcí je prázdný"
          text="Přidejte pravidelnou lekci (např. Pilates v úterý v 18:00). Termíny se pak v kalendáři a v online rezervaci objeví každý týden."
          action={
            <Button variant="primary" icon="plus" onClick={() => onNew(0)}>
              Přidat první lekci
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="set-stack">
      <div className="set-toolbar">
        <p className="statline">
          <span>
            <strong>{countLabel(templates.filter((t) => t.active && !isEnded(t)).length, ['lekce', 'lekce', 'lekcí'])}</strong> týdně
          </span>
          <span>
            <strong>{countLabel(seats, ['místo', 'místa', 'míst'])}</strong> v rozvrhu
          </span>
          {occ.seats > 0 && (
            <span>
              příštích 7 dní obsazeno{' '}
              <strong>
                {occ.taken} z {occ.seats}
              </strong>{' '}
              ({formatPercent(Math.round((occ.taken / occ.seats) * 100))})
            </span>
          )}
        </p>
        {endedCount > 0 && (
          <Switch checked={showEnded} onChange={setShowEnded} label={`Zobrazit ukončené (${endedCount})`} labelPosition="end" />
        )}
      </div>

      <div className="set-week">
        {WEEKDAYS.map((wd) => (
          <section key={wd} className={cx('set-week__day', !byDay[wd].length && 'is-empty')} aria-labelledby={`set-week-${wd}`}>
            <header className="set-week__head">
              <h3 id={`set-week-${wd}`} className="set-week__title">
                {weekdayName(wd)}
              </h3>
              <IconButton icon="plus" size="sm" label={`Přidat lekci – ${weekdayName(wd).toLowerCase()}`} onClick={() => onNew(wd)} />
            </header>
            {byDay[wd].length === 0 ? (
              <p className="set-week__empty">Bez lekcí</p>
            ) : (
              <ul className="set-week__list">
                {byDay[wd].map((t) => {
                  const svc = getService(clinic, t.serviceId);
                  const cat = svc ? getCategory(clinic, svc.categoryId) : undefined;
                  const trainer = getTherapist(clinic, t.therapistId);
                  const room = getRoom(clinic, t.roomId);
                  const n = next.get(t.id);
                  const notYet = t.validFrom > today;
                  const ended = isEnded(t);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        className={cx('set-lesson', `set-lesson--${cat?.tone ?? 'violet'}`, (!t.active || ended) && 'is-inactive')}
                        onClick={() => onEdit(t)}
                      >
                        <span className="set-lesson__time">
                          {formatTime(t.start)}–{formatTime(templateEnd(clinic, t))}
                        </span>
                        <span className="set-lesson__title">{t.title}</span>
                        <span className="set-lesson__meta">
                          {therapistShort(trainer)}
                          {room ? ` · ${room.name}` : ''} · {countLabel(t.capacity, ['místo', 'místa', 'míst'])}
                        </span>
                        {(!t.active || ended || notYet || t.validTo) && (
                          <span className="set-lesson__badges">
                            {!t.active && (
                              <Badge size="sm" tone="neutral">
                                Pozastaveno
                              </Badge>
                            )}
                            {ended && (
                              <Badge size="sm" tone="neutral">
                                Skončila {formatDayShort(t.validTo as string)}
                              </Badge>
                            )}
                            {!ended && notYet && (
                              <Badge size="sm" tone="info">
                                Od {formatDayShort(t.validFrom)}
                              </Badge>
                            )}
                            {!ended && !notYet && t.validTo && (
                              <Badge size="sm" tone="warning">
                                Do {formatDayShort(t.validTo)}
                              </Badge>
                            )}
                          </span>
                        )}
                        {n && t.active && (
                          <span className="set-lesson__next">
                            <span className="set-lesson__next-label">
                              {formatDayShort(n.session.start)}: {n.participants}/{n.session.capacity}
                            </span>
                            <Progress
                              size="xs"
                              value={n.participants}
                              max={n.session.capacity}
                              tone={n.participants >= n.session.capacity ? 'warning' : 'accent'}
                              label={`Nejbližší termín ${formatDayShort(n.session.start)}: obsazeno ${n.participants} z ${n.session.capacity}`}
                            />
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>

      <p className="set-footnote">
        <Icon name="info" size={14} /> Klikněte na lekci pro úpravu času, trenéra nebo kapacity. Jednotlivý termín (např. kvůli nemoci) zrušíte v
        kalendáři – klienti dostanou omluvnou zprávu.
      </p>
    </div>
  );
}
