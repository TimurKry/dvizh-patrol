'use client';

import { useEffect, useRef, useState } from 'react';
import type { Circle, Map as LeafletMapInstance, Marker } from 'leaflet';
// Без своей таблицы стилей Leaflet раскладывает тайлы лесенкой:
// позиционирование слоёв живёт именно в ней, а не в скрипте.
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { MapboxMap } from './mapbox-map';
import type { PlayArea } from '@/lib/geo';

/**
 * Карта квеста.
 *
 * Показывает игровое поле, точки заданий с привязкой к месту и —
 * по кнопке — где стоит сама команда.
 *
 * Три решения, которые стоит объяснить.
 *
 * **Leaflet, а не своя реализация.** Нужны панорамирование,
 * щипковый зум и инерция на телефоне. Написать это самому — двести
 * строк, которые будут дёргаться в руках у человека посреди города.
 * Библиотека весит сорок килобайт и грузится только на страницах
 * с картой.
 *
 * **Тайлы OpenStreetMap.** Без ключа, без счёта, без регистрации.
 * Атрибуция обязательна по лицензии и выводится всегда. Десять
 * команд на один вечер — это нагрузка, ради которой не нужен
 * платный поставщик; как его подключить, если понадобится,
 * описано в docs/MAP.md.
 *
 * **Геопозиция по кнопке, а не потоком.** `watchPosition` дал бы
 * плавную точку, но это постоянное отслеживание, которого мы
 * обещали не делать. Один запрос по нажатию, ничего не
 * сохраняется, на сервер не уходит.
 */

/**
 * Как точка показана на карте.
 *
 * `cross` — крест, как на пиратской карте: место известно точно,
 * к нему и надо дойти. `zone` — примерный район: центр не
 * показывается вовсе, только пунктирный круг с номером, потому
 * что у загадки точное место и есть ответ.
 */
export type MapPointKind = 'cross' | 'zone';

export interface MapPoint {
  id: string;
  latitude: number;
  longitude: number;
  /** Номер задания — он и рисуется рядом со знаком. */
  label: string;
  title: string;
  href?: string;
  /** Радиус зачёта задания: видно, насколько близко надо подойти. */
  radiusMeters?: number | null;
  kind?: MapPointKind;
  done?: boolean;
}

export interface QuestMapProps {
  area: PlayArea | null;
  points: MapPoint[];
  /** Высота карты. Отдельным пропом: на странице задания она ниже. */
  className?: string;
  /** Показывать кнопку «Где я». На странице задания не нужна. */
  showLocateButton?: boolean;
}

// Цвета Mono Signal. Leaflet рисует слои императивно и не видит
// CSS-переменных, поэтому значения дублируются здесь; менять их
// нужно вместе с @theme в app/globals.css.
const SIGNAL = '#ff00b3';
const INK = '#f5f5f1';
const CANVAS = '#060609';

/** Центр Лейпцига — куда смотреть, пока не известно ничего лучше. */
const FALLBACK = { latitude: 51.3397, longitude: 12.3731 };

/**
 * Карта квеста — точка входа.
 *
 * Есть токен Mapbox — рисуем на нём: тёмная подложка, объёмные
 * дома, наклон камеры. Нет токена — остаётся Leaflet на тайлах
 * OpenStreetMap.
 *
 * Запасной вариант не задел прошлого, а осознанная страховка.
 * Токен может кончиться по квоте, его могут отозвать, его может
 * не быть на превью — и во всех трёх случаях карта на квесте
 * нужнее красивой карты. Переключение по переменной, а не по
 * ошибке загрузки: так поведение предсказуемо и проверяемо.
 */
export function QuestMap(props: QuestMapProps) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (token) return <MapboxMap token={token} {...props} />;
  return <LeafletMap {...props} />;
}

function LeafletMap({
  area,
  points,
  className = 'h-[420px]',
  showLocateButton = true,
}: QuestMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMapInstance | null>(null);
  const meRef = useRef<{ marker: Marker; halo: Circle } | null>(null);

  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || mapRef.current) return;

    let cancelled = false;

    // Leaflet трогает window при загрузке модуля, поэтому его
    // нельзя импортировать статически в компоненте, который
    // рендерится и на сервере.
    void import('leaflet').then((mod) => {
      if (cancelled || !hostRef.current) return;
      const L = mod.default ?? mod;

      const map = L.map(host, {
        zoomControl: true,
        attributionControl: true,
        // Карта живёт внутри страницы. Перехватывать колесо мыши
        // при прокрутке — верный способ, чтобы человек не смог
        // пролистать страницу дальше.
        scrollWheelZoom: false,
      });

      // Вид задаётся сразу, до добавления слоёв. Без него карта
      // не считается загруженной: проекция не построена, и первый
      // же добавленный круг падает на layerPointToLatLng. Точные
      // границы выставляются ниже, когда станет известно, что
      // вообще нужно показать.
      map.setView([FALLBACK.latitude, FALLBACK.longitude], 14);

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map);

      const bounds = L.latLngBounds([]);

      if (area?.shape === 'polygon') {
        // GeoJSON хранит пары [долгота, широта], Leaflet ждёт
        // обратный порядок — перепутать их значит нарисовать поле
        // где-то в Индийском океане.
        const latLngs = area.polygon.coordinates[0].map(
          ([lon, lat]) => [lat, lon] as [number, number],
        );

        const polygon = L.polygon(latLngs, {
          color: SIGNAL,
          weight: 2,
          fillColor: SIGNAL,
          fillOpacity: 0.06,
        })
          .addTo(map)
          .bindPopup('Игровое поле');

        bounds.extend(polygon.getBounds());
      } else if (area) {
        L.circle([area.latitude, area.longitude], {
          radius: area.radiusMeters,
          color: SIGNAL,
          weight: 2,
          fillColor: SIGNAL,
          fillOpacity: 0.06,
        })
          .addTo(map)
          .bindPopup('Игровое поле');

        // Границы считаем из самой окружности, а не из
        // circle.getBounds(): тот спрашивает у карты проекцию и
        // потому зависит от текущего вида. toBounds — чистая
        // арифметика по метрам, её результат не зависит ни от
        // зума, ни от порядка вызовов.
        bounds.extend(L.latLng(area.latitude, area.longitude).toBounds(area.radiusMeters * 2));
      }

      for (const point of points) {
        const zone = point.kind === 'zone';

        // У района круг обязателен: без него от загадки на карте
        // остался бы номер в пустоте, а «примерно здесь» — это и
        // есть весь ответ, который она даёт.
        const radius = point.radiusMeters ?? (zone ? 220 : null);

        if (radius) {
          L.circle([point.latitude, point.longitude], {
            radius,
            color: point.done ? INK : zone ? SIGNAL : INK,
            weight: zone ? 2 : 1,
            dashArray: zone ? '7 7' : '4 4',
            fillColor: zone ? SIGNAL : INK,
            fillOpacity: zone ? 0.07 : 0.04,
          }).addTo(map);
        }

        const marker = L.marker([point.latitude, point.longitude], {
          title: point.title,
          icon: L.divIcon({
            className: '',
            html: zone ? zoneHtml(point) : crossHtml(point),
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          }),
        }).addTo(map);

        marker.bindPopup(popupHtml(point));
        bounds.extend(marker.getLatLng());

        if (radius) {
          bounds.extend(L.latLng(point.latitude, point.longitude).toBounds(radius * 2));
        }
      }

      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [28, 28] });
      } else {
        // Ни поля, ни точек — остаёмся на запасном виде,
        // выставленном выше: серый прямоугольник хуже, чем
        // просто карта города.
      }

      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      meRef.current = null;
    };
  }, [area, points]);

  async function locate() {
    const map = mapRef.current;
    if (!map) return;

    setLocateError(null);

    if (!('geolocation' in navigator)) {
      setLocateError('Браузер не умеет определять местоположение.');
      return;
    }

    setLocating(true);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10_000,
          maximumAge: 15_000,
        });
      });

      const { latitude, longitude, accuracy } = position.coords;
      const L = (await import('leaflet')).default;

      // Старую точку убираем: две отметки «я» на карте
      // запутывают сильнее, чем отсутствие одной.
      if (meRef.current) {
        meRef.current.marker.remove();
        meRef.current.halo.remove();
      }

      const halo = L.circle([latitude, longitude], {
        radius: Math.max(accuracy, 15),
        color: INK,
        weight: 1,
        fillColor: INK,
        fillOpacity: 0.1,
      }).addTo(map);

      const marker = L.marker([latitude, longitude], {
        icon: L.divIcon({
          className: '',
          html:
            `<span style="display:block;width:16px;height:16px;border-radius:9999px;` +
            `background:${SIGNAL};border:3px solid ${CANVAS}"></span>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      }).addTo(map);

      meRef.current = { marker, halo };
      map.setView([latitude, longitude], Math.max(map.getZoom(), 16));
    } catch (error) {
      const denied =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as GeolocationPositionError).code === 1;

      setLocateError(
        denied
          ? 'Доступ к геопозиции запрещён. Разрешите его в настройках браузера.'
          : 'Не удалось определить местоположение. Выйдите на открытое место и повторите.',
      );
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Тайлы OpenStreetMap светлые, а система тёмная: белый
          прямоугольник посреди чёрной страницы бьёт по глазам
          ночью, а сигнальные метки на нём теряются. Инверсия с
          коррекцией тона даёт тёмную карту, не требуя платного
          поставщика тайлов. Фильтр применяется только к слою
          подложки — метки, круги и подписи остаются как есть. */}
      <div
        ref={hostRef}
        className={`${className} w-full overflow-hidden border border-hairline bg-canvas-deep [&_.leaflet-container]:bg-canvas-deep [&_.leaflet-tile-pane]:invert [&_.leaflet-tile-pane]:hue-rotate-180 [&_.leaflet-tile-pane]:brightness-[0.92] [&_.leaflet-tile-pane]:contrast-[0.9] [&_.leaflet-tile-pane]:grayscale-[0.35]`}
        // Карта — интерактивный виджет. Скринридеру от неё пользы
        // нет, весь смысл продублирован списком заданий рядом.
        role="presentation"
      />

      {showLocateButton && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={locate} disabled={locating}>
            {locating ? 'Определяем…' : 'Где я'}
          </Button>
          <p className="text-caption text-faint">
            Местоположение запрашивается один раз и никуда не отправляется.
          </p>
        </div>
      )}

      {locateError && (
        <p className="text-caption text-ink" role="alert">
          <span aria-hidden="true">! </span>
          {locateError}
        </p>
      )}
    </div>
  );
}

/** Экранирование: названия заданий пишет организатор, но HTML тут наш. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Крест на карте сокровищ — точное место фото-задания.
 *
 * Обводка креста цветом холста нужна поверх тайлов: на светлой
 * брусчатке маджента сама по себе теряется, а обводка держит знак
 * читаемым на любом фоне. Номер висит подписью снизу, чтобы не
 * закрывать перекрестие — именно оно и указывает точку.
 */
function crossHtml(point: MapPoint): string {
  const color = point.done ? INK : SIGNAL;
  return (
    `<span style="position:relative;display:block;width:34px;height:34px">` +
    `<svg width="34" height="34" viewBox="0 0 34 34" fill="none">` +
    `<path d="M9 9 25 25M25 9 9 25" stroke="${CANVAS}" stroke-width="7" stroke-linecap="round"/>` +
    `<path d="M9 9 25 25M25 9 9 25" stroke="${color}" stroke-width="3.4" stroke-linecap="round"/>` +
    `</svg>` +
    `<span style="position:absolute;left:50%;top:30px;transform:translateX(-50%);` +
    `padding:1px 5px;border-radius:2px;background:${CANVAS};color:${INK};` +
    `font:600 11px/1.3 Onest,sans-serif">${escapeHtml(point.label)}</span>` +
    `</span>`
  );
}

/**
 * Район загадки. Точки нет намеренно: показать центр — значит
 * выдать ответ. Виден только номер, вокруг которого нарисован
 * пунктирный круг.
 */
function zoneHtml(point: MapPoint): string {
  const color = point.done ? INK : SIGNAL;
  return (
    `<span style="display:flex;align-items:center;justify-content:center;` +
    `width:34px;height:34px;border-radius:9999px;background:${CANVAS};` +
    `color:${color};border:2px dashed ${color};font:600 13px/1 Onest,sans-serif">` +
    `${escapeHtml(point.label)}</span>`
  );
}

function popupHtml(point: MapPoint): string {
  const title = escapeHtml(point.title);
  const body = point.done ? '<div>Уже принято</div>' : '';
  const link = point.href
    ? `<a href="${escapeHtml(point.href)}" style="color:${SIGNAL}">Открыть задание</a>`
    : '';
  return `<strong>${title}</strong>${body}${link ? `<div>${link}</div>` : ''}`;
}
