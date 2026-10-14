import type { Campaign, ClinicState, Id, LocalDateTime, SegmentDefinition, SegmentRule } from '../domain/types';
import { countLabel, formatMoney } from './format';
import { renderTemplate, type TemplateVars } from './messages';
import {
  activePackages,
  bookingsOfClient,
  clientCredit,
  getCategory,
  getPackageTemplate,
  getService,
  packageUsage,
} from './selectors';
import { addDays, dateOf, daysBetween } from './time';

/** Segmentace klientů pro newslettery. Obchodní sdělení dostávají jen klienti se souhlasem. */

function ruleMatches(s: ClinicState, clientId: Id, rule: SegmentRule, now: LocalDateTime): boolean {
  const today = dateOf(now);
  switch (rule.type) {
    case 'visited_category': {
      const since = addDays(now, -rule.withinDays);
      return bookingsOfClient(s, clientId).some((b) => {
        if (b.status !== 'completed' || b.start < since) return false;
        return getService(s, b.serviceId)?.categoryId === rule.categoryId;
      });
    }
    case 'no_visit_for': {
      const visits = bookingsOfClient(s, clientId).filter((b) => b.status === 'completed');
      if (!visits.length) return false;
      const last = visits[visits.length - 1].start;
      const hasUpcoming = bookingsOfClient(s, clientId).some((b) => b.status === 'confirmed' && b.start > now);
      return !hasUpcoming && daysBetween(dateOf(last), today) >= rule.days;
    }
    case 'has_active_package':
      return activePackages(s, clientId, today).some((p) => !rule.templateId || p.templateId === rule.templateId);
    case 'package_expiring':
      return activePackages(s, clientId, today).some((p) => {
        const u = packageUsage(s, p, today);
        return u.free > 0 && daysBetween(today, u.validUntil) <= rule.withinDays;
      });
    case 'has_upcoming_booking': {
      const until = addDays(now, rule.withinDays);
      return bookingsOfClient(s, clientId).some((b) => b.status === 'confirmed' && b.start > now && b.start <= until);
    }
    case 'tag': {
      const c = s.clients.find((x) => x.id === clientId);
      const tag = rule.tag.trim().toLowerCase();
      return !!c && c.tags.some((t) => t.toLowerCase() === tag);
    }
    case 'new_client': {
      const c = s.clients.find((x) => x.id === clientId);
      return !!c && c.createdAt >= addDays(now, -rule.withinDays);
    }
    case 'credit_balance_gt':
      return clientCredit(s, clientId) > rule.amount;
    default:
      return false;
  }
}

/** Klienti odpovídající segmentu (pouze se souhlasem s obchodními sděleními). */
export function evaluateSegment(s: ClinicState, seg: SegmentDefinition, now: LocalDateTime): Id[] {
  const out: Id[] = [];
  for (const c of s.clients) {
    if (!c.consents.marketingEmail || !c.email) continue;
    const included =
      seg.rules.length === 0 ||
      (seg.match === 'all'
        ? seg.rules.every((r) => ruleMatches(s, c.id, r, now))
        : seg.rules.some((r) => ruleMatches(s, c.id, r, now)));
    if (!included) continue;
    if (seg.exclude.some((r) => ruleMatches(s, c.id, r, now))) continue;
    out.push(c.id);
  }
  return out;
}

/** Počty pro zobrazení: celkem se souhlasem / po pravidlech / po vyloučení. */
export function segmentFunnel(s: ClinicState, seg: SegmentDefinition, now: LocalDateTime): { consented: number; matched: number; excluded: number; final: number } {
  let consented = 0;
  let matched = 0;
  let excluded = 0;
  for (const c of s.clients) {
    if (!c.consents.marketingEmail || !c.email) continue;
    consented++;
    const included =
      seg.rules.length === 0 ||
      (seg.match === 'all' ? seg.rules.every((r) => ruleMatches(s, c.id, r, now)) : seg.rules.some((r) => ruleMatches(s, c.id, r, now)));
    if (!included) continue;
    matched++;
    if (seg.exclude.some((r) => ruleMatches(s, c.id, r, now))) excluded++;
  }
  return { consented, matched, excluded, final: matched - excluded };
}

export function describeRule(s: ClinicState, rule: SegmentRule): string {
  switch (rule.type) {
    case 'visited_category':
      return `${getCategory(s, rule.categoryId)?.name ?? 'Kategorie'} za posledních ${rule.withinDays} dní`;
    case 'no_visit_for':
      return `Bez návštěvy ${countLabel(rule.days, ['den', 'dny', 'dní'])} a bez budoucí rezervace`;
    case 'has_active_package':
      return rule.templateId ? `Aktivní permanentka ${getPackageTemplate(s, rule.templateId)?.name ?? ''}` : 'Má aktivní permanentku';
    case 'package_expiring':
      return `Permanentka končí do ${countLabel(rule.withinDays, ['dne', 'dnů', 'dnů'])}`;
    case 'has_upcoming_booking':
      return `Termín v příštích ${countLabel(rule.withinDays, ['dni', 'dnech', 'dnech'])}`;
    case 'tag':
      return `Štítek „${rule.tag}"`;
    case 'new_client':
      return `Nový klient (posledních ${rule.withinDays} dní)`;
    case 'credit_balance_gt':
      return `Kredit vyšší než ${formatMoney(rule.amount)}`;
    default:
      return 'Pravidlo';
  }
}

export const RULE_TYPES: { type: SegmentRule['type']; label: string }[] = [
  { type: 'visited_category', label: 'Navštívil kategorii služeb' },
  { type: 'no_visit_for', label: 'Dlouho nepřišel' },
  { type: 'has_active_package', label: 'Má aktivní permanentku' },
  { type: 'package_expiring', label: 'Permanentka brzy končí' },
  { type: 'has_upcoming_booking', label: 'Má budoucí termín' },
  { type: 'tag', label: 'Má štítek' },
  { type: 'new_client', label: 'Nový klient' },
  { type: 'credit_balance_gt', label: 'Kredit vyšší než' },
];

export function defaultRule(s: ClinicState, type: SegmentRule['type']): SegmentRule {
  switch (type) {
    case 'visited_category':
      return { type, categoryId: s.categories[0]?.id ?? '', withinDays: 180 };
    case 'no_visit_for':
      return { type, days: 90 };
    case 'has_active_package':
      return { type, templateId: null };
    case 'package_expiring':
      return { type, withinDays: 30 };
    case 'has_upcoming_booking':
      return { type, withinDays: 7 };
    case 'tag':
      return { type, tag: '' };
    case 'new_client':
      return { type, withinDays: 30 };
    case 'credit_balance_gt':
      return { type, amount: 0 };
    default:
      return { type: 'no_visit_for', days: 90 };
  }
}

/** Textová podoba kampaně (pro uložení odeslané zprávy). */
export function campaignPlainText(c: Campaign, vars: TemplateVars): string {
  const parts: string[] = [];
  for (const b of c.blocks) {
    if (b.type === 'heading') parts.push(renderTemplate(b.text, vars).toUpperCase());
    else if (b.type === 'text') parts.push(renderTemplate(b.text, vars));
    else if (b.type === 'list') parts.push(b.items.map((it, i) => `${i + 1}. ${renderTemplate(it, vars)}`).join('\n'));
    else if (b.type === 'button') parts.push(`→ ${b.label}`);
    else if (b.type === 'divider') parts.push('—');
  }
  parts.push('Tento e-mail dostáváte, protože jste nám udělili souhlas se zasíláním novinek. Odhlásit odběr můžete jedním kliknutím v patičce nebo ve svém účtu.');
  return parts.join('\n\n');
}
