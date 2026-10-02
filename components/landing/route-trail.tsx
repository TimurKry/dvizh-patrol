import { cn } from '@/lib/cn';

/**
 * Пунктирная тропа маршрута — пиратская карта из мультфильмов:
 * штрих бежит от точки к точке, когда секция въезжает в кадр.
 *
 * Два решения, до которых пришлось дойти не с первого раза.
 *
 * 1. Тропа разрезана на куски, а не нарисована одной линией
 *    поверх секции. Одной линии пришлось бы растягиваться под
 *    высоту списка, а `preserveAspectRatio="none"` растягивает
 *    вместе с ней и штрих: пунктир превращается в сплошную серую
 *    кривую, толщина плывёт. У кусков фиксированного размера
 *    ритм штриха всегда тот, что задан.
 *
 * 2. Пунктир и прочерк разведены по двум путям. Оба приёма
 *    держатся на `stroke-dasharray`: у пунктира это узор, у
 *    прочерка — один штрих во всю длину, который выезжает
 *    из-под `dashoffset`. В одном пути они не уживаются, и
 *    побеждает CSS — линия выходит сплошной. Поэтому рисунок
 *    рисует один путь, а второй, невидимый и толстый, работает
 *    маской: он и «прочерчивается», открывая пунктир по мере
 *    роста.
 *
 * Рисуется однократно: `forwards` держит конечное состояние, а
 * `Reveal` снимает наблюдателя после первого срабатывания.
 */

const LINK_PATH = 'M30 1 C 46 12, 14 24, 30 43';
const LINK_LENGTH = 66;

const RULE_PATH = 'M2 6 H 1198';
const RULE_LENGTH = 1200;

/**
 * Звено между двумя карточками маршрута. Размер фиксированный,
 * поэтому не тянется ни по одной оси.
 *
 * `id` обязателен и должен быть уникальным: маска адресуется по
 * `url(#…)`, и при совпадении идентификаторов все звенья возьмут
 * маску первого — то есть будут прочерчиваться разом, а не по
 * очереди.
 */
export function TrailLink({ id, className }: { id: string; className?: string }) {
  const mask = `trail-link-${id}`;

  return (
    <svg
      aria-hidden="true"
      width="60"
      height="44"
      viewBox="0 0 60 44"
      fill="none"
      className={cn('shrink-0', className)}
      style={{ ['--trail-length' as string]: LINK_LENGTH }}
    >
      <mask id={mask} maskUnits="userSpaceOnUse">
        <path
          d={LINK_PATH}
          className="trail-path"
          stroke="#fff"
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
        />
      </mask>
      <path
        d={LINK_PATH}
        mask={`url(#${mask})`}
        stroke="#060609"
        strokeOpacity="0.55"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeDasharray="3.5 8"
        fill="none"
      />
    </svg>
  );
}

/**
 * Длинный прочерк под сеткой на десктопе со стрелкой на конце.
 * Тянется только по горизонтали и почти один к одному: viewBox
 * подобран под ширину колодца, так что штрих не плывёт.
 */
export function TrailRule({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 1200 12"
        preserveAspectRatio="none"
        className="h-3 flex-1"
        fill="none"
        style={{ ['--trail-length' as string]: RULE_LENGTH }}
      >
        <mask id="trail-rule-mask" maskUnits="userSpaceOnUse">
          <path
            d={RULE_PATH}
            className="trail-path"
            stroke="#fff"
            strokeWidth="12"
            strokeLinecap="butt"
            fill="none"
          />
        </mask>
        <path
          d={RULE_PATH}
          mask="url(#trail-rule-mask)"
          stroke="#060609"
          strokeOpacity="0.55"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray="7 13"
          fill="none"
        />
      </svg>

      {/* Наконечник отдельным элементом: пунктир искрошил бы и
          его, а стрелка обязана остаться стрелкой. */}
      <svg aria-hidden="true" width="20" height="14" viewBox="0 0 20 14" fill="none">
        <path
          d="M1 7h17M12 1l6 6-6 6"
          stroke="#060609"
          strokeOpacity="0.55"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
