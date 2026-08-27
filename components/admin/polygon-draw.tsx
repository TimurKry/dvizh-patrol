'use client';

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, Marker, Polygon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon } from '@/components/ui/icon';
import type { PolygonRing } from '@/lib/geo';

/**
 * Рисование контура по кликам.
 *
 * Клик ставит точку, точки соединяются, маркеры перетаскиваются,
 * лишние удаляются кнопкой рядом со списком. Компонент
 * управляемый: точки живут у вызывающего, Leaflet перерисовывается
 * из них эффектом. Обратного потока нет — если бы Leaflet был
 * источником истины, drag и клик правили бы одно и то же с двух
 * сторон, и контур начал бы расходиться со списком.
 *
 * Вынесено из `PlayAreaEditor`, когда контур понадобился и
 * заданию. Границу поля и область загадки рисуют одинаково;
 * различаются они тем, куда потом уходит GeoJSON, и это дело
 * вызывающего.
 *
 * Замыкающая точка в состоянии не хранится: это деталь формата.
 * Иначе организатор видел бы в списке лишнюю строку и удалял бы её
 * вместе с первой.
 */

const SIGNAL = '#ff00b3';
const CANVAS = '#060609';
const GUIDE = '#83838b';

/** Центр Лейпцига — куда смотреть, пока контура нет. */
const FALLBACK: [number, number] = [51.3397, 12.3731];

export interface DrawPoint {
  lat: number;
  lon: number;
}

/** Точки в кольцо GeoJSON: [lon, lat] и замыкание. */
export function toRing(points: DrawPoint[]): PolygonRing {
  const ring = points.map(({ lat, lon }) => [lon, lat] as [number, number]);
  const first = ring[0];
  if (first) ring.push([first[0], first[1]]);
  return ring;
}

export function PolygonDraw({
  points,
  onChange,
  guide,
  height = 'h-[420px]',
}: {
  points: DrawPoint[];
  onChange: (next: DrawPoint[]) => void;
  /**
   * Подсказка на фоне — обычно граница игрового поля. Рисуется
   * серым и не редактируется: область задания должна лежать
   * внутри поля, и без ориентира это видно только на глаз.
   */
  guide?: PolygonRing | null;
  height?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const shapeRef = useRef<Polygon | null>(null);
  const guideRef = useRef<Polygon | null>(null);
  const markersRef = useRef<Marker[]>([]);
  // Карта наводится на контур один раз, при открытии. Двигать её
  // после каждой поставленной точки нельзя: карта уезжает из-под
  // курсора, и следующий клик попадает не туда, куда целились.
  const fittedRef = useRef(false);

  // Свежие точки для обработчика клика: сам обработчик вешается
  // один раз на экземпляр карты и замкнул бы первый массив.
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || mapRef.current) return;

    let cancelled = false;

    void import('leaflet').then((mod) => {
      if (cancelled || !hostRef.current) return;
      const L = mod.default ?? mod;

      const map = L.map(host, { zoomControl: true, scrollWheelZoom: false });
      map.setView(FALLBACK, 14);

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map);

      // Обработчик вешается на конкретный экземпляр, а экземпляр
      // создаётся один раз: повторный вызов эффекта (StrictMode в
      // разработке, быстрый перемонтаж) не должен давать две точки
      // на один клик.
      map.on('click', (event: { latlng: { lat: number; lng: number } }) => {
        if (mapRef.current !== map) return;
        onChangeRef.current([
          ...pointsRef.current,
          { lat: event.latlng.lat, lon: event.latlng.lng },
        ]);
      });

      mapRef.current = map;
      // Первая отрисовка: эффект ниже сработал раньше, чем карта
      // появилась, поэтому дорисовываем вручную.
      redraw(L, map);
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      shapeRef.current = null;
      guideRef.current = null;
      markersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function redraw(L: typeof import('leaflet'), map: LeafletMap) {
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];
    shapeRef.current?.remove();
    shapeRef.current = null;
    guideRef.current?.remove();
    guideRef.current = null;

    if (guide && guide.length >= 4) {
      guideRef.current = L.polygon(
        guide.map(([lon, lat]) => [lat, lon] as [number, number]),
        { color: GUIDE, weight: 1, dashArray: '6 6', fill: false, interactive: false },
      ).addTo(map);
    }

    const current = pointsRef.current;

    if (current.length >= 3) {
      shapeRef.current = L.polygon(
        current.map((p) => [p.lat, p.lon] as [number, number]),
        { color: SIGNAL, weight: 2, fillColor: SIGNAL, fillOpacity: 0.08 },
      ).addTo(map);
    } else if (current.length === 2) {
      // Двух точек мало для фигуры, но линию показать полезно:
      // видно, что первая точка не потерялась.
      shapeRef.current = L.polygon(
        current.map((p) => [p.lat, p.lon] as [number, number]),
        { color: SIGNAL, weight: 2, dashArray: '4 4', fill: false },
      ).addTo(map);
    }

    current.forEach((point, index) => {
      const marker = L.marker([point.lat, point.lon], {
        draggable: true,
        keyboard: true,
        title: `Точка ${index + 1}`,
        icon: L.divIcon({
          className: '',
          html:
            `<span style="display:flex;align-items:center;justify-content:center;` +
            `width:24px;height:24px;border-radius:9999px;background:${SIGNAL};` +
            `color:${CANVAS};border:2px solid ${CANVAS};font:600 11px/1 Onest,sans-serif">` +
            `${index + 1}</span>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      }).addTo(map);

      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng();
        onChangeRef.current(
          pointsRef.current.map((item, i) => (i === index ? { lat, lon: lng } : item)),
        );
      });

      markersRef.current.push(marker);
    });

    const fitTo = shapeRef.current ?? guideRef.current;
    if (fitTo && !fittedRef.current) {
      fittedRef.current = true;
      map.fitBounds(fitTo.getBounds(), { padding: [32, 32] });
    }
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;
    void import('leaflet').then((mod) => {
      if (cancelled || mapRef.current !== map) return;
      redraw(mod.default ?? mod, map);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, guide]);

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={hostRef}
        className={`${height} w-full border border-hairline bg-canvas-deep [&_.leaflet-tile]:invert [&_.leaflet-tile]:hue-rotate-180 [&_.leaflet-tile]:grayscale-[0.35] [&_.leaflet-tile]:brightness-[0.92] [&_.leaflet-tile]:contrast-[0.9]`}
        role="presentation"
      />

      <p className="text-caption text-muted">
        Клик по карте ставит точку, точку можно перетащить. Минимум три точки — контур замкнётся сам
        при сохранении.
        {guide && ' Пунктиром показана граница игрового поля.'}
      </p>

      {points.length > 0 && (
        <ol className="flex flex-col border border-hairline bg-panel">
          {points.map((point, index) => (
            <li
              key={`${point.lat}-${point.lon}-${index}`}
              className={`flex items-center justify-between gap-3 px-4 py-2 ${
                index > 0 ? 'border-t border-hairline' : ''
              }`}
            >
              <span className="font-mono text-caption text-muted">
                {index + 1}. {point.lat.toFixed(5)}, {point.lon.toFixed(5)}
              </span>
              <button
                type="button"
                onClick={() => onChange(points.filter((_, i) => i !== index))}
                className="tap-target px-3 text-caption text-muted hover:text-signal"
              >
                <span className="sr-only">Удалить точку {index + 1}</span>
                <Icon name="remove" size={16} />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
