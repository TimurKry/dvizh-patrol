'use client';

import Image from 'next/image';
import { CardBack } from '@/components/game/card-back';
import { FlipCard } from '@/components/ui/flip-card';
import { teamColorVars } from '@/lib/team-colors';

/**
 * Демонстрационная карточка на лендинге.
 *
 * Figma 81:4 «Section / Task Card Lab». Показывает три вещи
 * разом: как выглядит лицевая сторона, что рубашка красится в
 * цвет команды и что переворот работает пальцем и с клавиатуры.
 *
 * Настоящее задание сюда не подставляется намеренно. Пул заданий
 * скрыт до старта, и лендинг — последнее место, где его стоило
 * бы приоткрывать. Поэтому здесь витринный пример, и он честно
 * помечен: «пример», баллы со звёздочкой.
 */

const TYPES = [
  { icon: '?', label: 'Загадка', count: 2 },
  { icon: '□', label: 'Фото-повтор', count: 2 },
  { icon: '↗', label: 'Актив', count: 2 },
] as const;

export function TaskCardDemo() {
  return (
    <div className="flex flex-col gap-5" style={teamColorVars('pink')}>
      {/* ═══ Правило руки · Figma 102:2 ═════════════════════ */}
      <div className="flex items-center justify-between gap-4 border border-hairline bg-panel px-4 py-4">
        <span className="signal-label text-micro text-ink">Рука 6 / 6</span>
        <ul className="flex items-center gap-3">
          {TYPES.map((type) => (
            <li key={type.label} className="signal-label flex items-center gap-1 text-micro">
              <span aria-hidden="true" className="text-signal">
                {type.icon}
              </span>
              <span className="sr-only">{type.label}:</span>
              <span className="text-muted">{type.count}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ═══ Карточка · Figma 102:33 ════════════════════════ */}
      <FlipCard
        className="mx-auto min-h-[479px] w-full max-w-[342px]"
        flipLabel="Показать рубашку карточки"
        front={
          <article className="flex h-full flex-col gap-4 rounded-[8px] border border-hairline bg-[#f5f5f1] p-5 text-[#060609]">
            <div className="flex items-start justify-between gap-3">
              <span
                aria-hidden="true"
                className="flex h-11 w-11 items-center justify-center border border-[#060609] text-body-lg"
              >
                □
              </span>
              <span className="display-figure bg-[#060609] px-3 py-2 text-title text-[#f5f5f1]">
                180 Б*
              </span>
            </div>

            <p className="signal-label text-micro text-[#5c5c63]">Фото-повтор / пример</p>

            <h3 className="text-title text-[#060609]">
              Повторите
              <br />
              скульптуру
            </h3>

            <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#060609]">
              <Image
                src="/assets/task-example-1.webp"
                alt=""
                fill
                sizes="(min-width: 640px) 300px, 90vw"
                className="object-cover opacity-80"
              />
              <span className="signal-label absolute top-2 left-2 bg-[#060609] px-2 py-1 text-micro text-[#f5f5f1]">
                Фото-эталон
              </span>
            </div>

            <p className="text-caption text-[#5c5c63]">
              Найдите объект и повторите позу как можно точнее.
            </p>

            <p className="mt-auto flex items-center justify-center gap-2 border border-[#87877f] py-3">
              <span aria-hidden="true">◇</span>
              <span className="signal-label text-micro text-[#060609]">Доступно</span>
            </p>
          </article>
        }
        back={<CardBack caption="Движ-Патруль" hint="Рубашка красится в цвет команды" />}
      />

      {/* ═══ Правило гонки · Figma 102:53 ═══════════════════ */}
      <p className="flex flex-col gap-1 border-t border-hairline pt-4">
        <span className="signal-label text-micro text-signal">Принято → карта исчезает у всех</span>
        <span className="text-caption text-muted">
          Побеждает первая валидная отправка по времени сервера. Баллы на примере — витринные.
        </span>
      </p>
    </div>
  );
}
