import { describe, expect, it } from 'vitest';
import { contactLinks, labelOf, SCENARIO_LABEL } from '@/lib/studio/leads';

describe('contactLinks', () => {
  it('ник с собакой и без', () => {
    expect(contactLinks('@timur_k', null)).toEqual([
      { kind: 'telegram', label: '@timur_k', href: 'https://t.me/timur_k' },
    ]);
    expect(contactLinks('timur_k', null)[0]?.href).toBe('https://t.me/timur_k');
  });

  it('ссылка t.me', () => {
    expect(contactLinks('https://t.me/timur_k/', null)[0]?.href).toBe('https://t.me/timur_k');
  });

  it('телефон — Telegram и WhatsApp', () => {
    expect(contactLinks('+49 (151) 234-56-78', null).map((l) => l.href)).toEqual([
      'https://t.me/+491512345678',
      'https://wa.me/491512345678',
    ]);
  });

  it('мусор не превращается в ссылку, email добавляется', () => {
    expect(contactLinks('звоните вечером', 'a@b.de')).toEqual([
      { kind: 'email', label: 'a@b.de', href: 'mailto:a@b.de' },
    ]);
    expect(contactLinks(null, null)).toEqual([]);
  });
});

describe('labelOf', () => {
  it('неизвестный код показывается как есть', () => {
    expect(labelOf(SCENARIO_LABEL, 'dvizh-patrol')).toBe('Движ Патруль');
    expect(labelOf(SCENARIO_LABEL, 'new-game')).toBe('new-game');
    expect(labelOf(SCENARIO_LABEL, null)).toBeNull();
  });
});
