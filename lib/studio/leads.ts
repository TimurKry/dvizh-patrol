import type { LeadSource, LeadStatus } from '@/types/database';

/**
 * Подписи и справочники заявок.
 *
 * Коды сценариев, числа участников и цены билета приходят с формы
 * брифа на лендинге (dvizh-events-os, lib/validation/lead.ts).
 * Неизвестный код показывается как есть: лендинг может добавить
 * вариант раньше, чем Студия о нём узнает, и заявка не должна
 * от этого пропасть из вида.
 */

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'Новая',
  contacted: 'Связались',
  qualified: 'Подходит',
  proposal_sent: 'КП отправлено',
  won: 'Выиграли',
  lost: 'Отказ',
};

/** Порядок колонок воронки. Отказ — в конце, он вне потока. */
export const LEAD_FUNNEL: readonly LeadStatus[] = [
  'new',
  'contacted',
  'qualified',
  'proposal_sent',
  'won',
  'lost',
];

export const OPEN_LEAD_STATUSES: readonly LeadStatus[] = [
  'new',
  'contacted',
  'qualified',
  'proposal_sent',
];

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  site: 'Сайт',
  telegram: 'Telegram',
  manual: 'Вручную',
};

export const SCENARIO_LABEL: Record<string, string> = {
  'dvizh-patrol': 'Движ Патруль',
  'cossacks-robbers': 'Казаки-разбойники',
  zombie: 'Zombie / Догонялки',
  territory: 'Захват территории',
  'help-me-choose': 'Помочь подобрать',
  custom: 'Свой формат',
};

export const PARTICIPANTS_LABEL: Record<string, string> = {
  'lt-30': '< 30',
  '30-50': '30–50',
  '50-100': '50–100',
  '100-200': '100–200',
  '200-500': '200–500',
  '500-plus': '500+',
};

export const TICKET_PRICE_LABEL: Record<string, string> = {
  free: 'Бесплатно',
  'lt-10': '< 10 €',
  '10-20': '10–20 €',
  '20-30': '20–30 €',
  '30-plus': '30 €+',
  custom: 'Другое',
};

export function labelOf(map: Record<string, string>, code: string | null): string | null {
  if (!code) return null;
  return map[code] ?? code;
}

// ═══ Контакт ═══════════════════════════════════════════════════

export interface ContactLink {
  kind: 'telegram' | 'whatsapp' | 'email';
  label: string;
  href: string;
}

const TG_USERNAME = /^[a-z][a-z0-9_]{4,31}$/i;

/**
 * Ссылки «написать» по полю мессенджера.
 *
 * В форме одно поле «Telegram или WhatsApp», поэтому люди пишут
 * туда что угодно: @ник, ник без собаки, t.me-ссылку, телефон с
 * пробелами. Телефон даёт две ссылки — по нему одинаково можно
 * найти человека и в Telegram, и в WhatsApp, а что именно имелось
 * в виду, из заявки не понять.
 */
export function contactLinks(messenger: string | null, email: string | null): ContactLink[] {
  const links: ContactLink[] = [];
  const raw = messenger?.trim() ?? '';

  if (raw) {
    const fromUrl = raw.match(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-z0-9_]+)\/?$/i);
    const handle = fromUrl?.[1] ?? raw.replace(/^@/, '');
    const digits = raw.replace(/[\s()./-]/g, '');

    if (/^\+?\d{7,15}$/.test(digits)) {
      const phone = digits.replace(/^\+/, '');
      links.push({ kind: 'telegram', label: 'Telegram', href: `https://t.me/+${phone}` });
      links.push({ kind: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/${phone}` });
    } else if (TG_USERNAME.test(handle)) {
      links.push({ kind: 'telegram', label: `@${handle}`, href: `https://t.me/${handle}` });
    }
  }

  const mail = email?.trim();
  if (mail) links.push({ kind: 'email', label: mail, href: `mailto:${mail}` });

  return links;
}

// ═══ Даты ══════════════════════════════════════════════════════

const STUDIO_TZ = 'Europe/Berlin';

export function formatLeadDateTime(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: STUDIO_TZ,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Дата ивента хранится как date без времени — не сдвигаем её часовым поясом. */
export function formatEventDate(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** «сегодня», «вчера», «5 дн.» — сколько заявка лежит без движения. */
export function ageLabel(iso: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  return `${days} дн.`;
}
