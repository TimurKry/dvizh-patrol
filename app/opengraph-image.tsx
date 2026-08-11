import { ImageResponse } from 'next/og';
import { formatEventDate, formatEventTime, formatPrice, getCurrentEvent } from '@/lib/data/event';

/**
 * Социальное превью.
 *
 * Рисуется кодом, а не лежит картинкой: дата, время и цена
 * приходят из `events`, поэтому превью не расходится с сайтом
 * после переноса мероприятия. Постера в системе больше нет.
 *
 * Шрифты Unbounded и Onest здесь не используются намеренно.
 * ImageResponse не умеет брать next/font и потребовал бы тянуть
 * файлы шрифтов в репозиторий ради одной картинки; Arial с
 * тем же начертанием и трекингом даёт достаточно близкий
 * результат в ленте мессенджера.
 */

export const alt = 'Движ-Патруль — городской фото-квест в Лейпциге';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Значения на случай недоступной базы: превью не должно падать. */
const FALLBACK = { date: '05.09.2026', time: '14:00', price: '15 €' };

export default async function OpenGraphImage() {
  let facts = FALLBACK;

  try {
    const event = await getCurrentEvent();
    if (event) {
      facts = {
        date: formatEventDate(event),
        time: formatEventTime(event),
        price: formatPrice(event),
      };
    }
  } catch {
    // База недоступна на этапе сборки — рисуем зафиксированные
    // значения. Пустая карточка в мессенджере хуже, чем карточка
    // с датой, которая почти наверняка не менялась.
  }

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#060609',
        color: '#F5F5F1',
        padding: '58px 64px',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: 92, height: 6, background: '#FF00B3' }} />
        <div
          style={{
            color: '#FF00B3',
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 3,
            textTransform: 'uppercase',
          }}
        >
          Leipzig / 2026
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            fontSize: 108,
            lineHeight: 0.9,
            fontWeight: 900,
            letterSpacing: -7,
            textTransform: 'uppercase',
          }}
        >
          ДВИЖ
        </div>
        <div
          style={{
            fontSize: 108,
            lineHeight: 0.9,
            fontWeight: 900,
            letterSpacing: -7,
            textTransform: 'uppercase',
          }}
        >
          ПАТРУЛЬ
        </div>
        <div
          style={{
            marginTop: 28,
            color: '#A3A3A8',
            fontSize: 28,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          Городской фото-квест
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          borderTop: '2px solid #404045',
          borderBottom: '2px solid #404045',
        }}
      >
        {[
          [facts.date, 'Дата'],
          [facts.time, 'Старт'],
          [facts.price, 'Участие'],
        ].map(([value, label], index) => (
          <div
            key={label}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '18px 12px',
              borderLeft: index === 0 ? 'none' : '2px solid #404045',
            }}
          >
            <div style={{ fontSize: 35, fontWeight: 800 }}>{value}</div>
            <div
              style={{
                marginTop: 6,
                color: index === 1 ? '#FF00B3' : '#A3A3A8',
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}
