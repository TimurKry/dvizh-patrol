'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker, Polygon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { savePlayAreaAction, type AdminActionState } from '@/actions/admin';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/feedback';
import { asAreaPolygon, type PolygonRing } from '@/lib/geo';
import { Icon } from '@/components/ui/icon';

/**
 * Редактор игрового поля · Figma 155:404.
 *
 * Клик по карте ставит точку, точки соединяются в контур, маркеры
 * перетаскиваются, лишние удаляются кнопкой рядом со списком.
 * Сохранение отправляет GeoJSON серверу, который проверяет его
 * заново — браузеру здесь не доверяют.
 *
 * Точки хранятся в React-состоянии, а Leaflet перерисовывается из
 * него эффектом. Обратного потока нет: если бы Leaflet был
 * источником истины, drag и клик правили бы одно и то же с двух
 * сторон, и контур начал бы расходиться со списком.
 *
 * Контур замыкается только при сохранении. Держать замыкающую
 * точку в состоянии значило бы показывать организатору лишнюю
 * строку в списке и удалять её вместе с первой.
 */

const INITIAL: AdminActionState = { ok: false };
const SIGNAL = '#ff00b3';
const CANVAS = '#060609';

/** Центр Лейпцига — куда смотреть, пока границы нет. */
const FALLBACK: [number, number] = [51.3397, 12.3731];

type Point = { lat: number; lon: number };

function toRing(points: Point[]): PolygonRing {
  const ring = points.map(({ lat, lon }) => [lon, lat] as [number, number]);
  const first = ring[0];
  if (first) ring.push([first[0], first[1]]);
  return ring;
}

export function PlayAreaEditor({
  eventId,
  polygon,
}: {
  eventId: string;
  /** Сохранённая граница из `events.area_polygon`. */
  polygon: unknown;
}) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(
    savePlayAreaAction,
    INITIAL,
  );

  const [points, setPoints] = useState<Point[]>(() => {
    const parsed = asAreaPolygon(polygon);
    if (!parsed) return [];
    // Замыкающая точка — деталь формата, а не отдельный угол.
    const ring = parsed.coordinates[0].slice(0, -1);
    return ring.map(([lon, lat]) => ({ lat, lon }));
  });

  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const shapeRef = useRef<Polygon | null>(null);
  const markersRef = useRef<Marker[]>([]);
  // Карта наводится на контур один раз, при открытии. Двигать её
  // после каждой поставленной точки нельзя: карта уезжает
  // из-под курсора, и следующий клик попадает не туда, куда
  // целился организатор.
  const fittedRef = useRef(false);

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

      // Обработчик вешается на конкретный экземпляр карты, а
      // экземпляр создаётся один раз: повторный вызов эффекта
      // (StrictMode в разработке, быстрый перемонтаж) не должен
      // приводить к двум точкам на один клик.
      map.on('click', (event: { latlng: { lat: number; lng: number } }) => {
        if (mapRef.current !== map) return;
        setPoints((current) => [...current, { lat: event.latlng.lat, lon: event.latlng.lng }]);
      });

      mapRef.current = map;
      // Первая отрисовка контура: эффект ниже сработает раньше,
      // чем карта появится, поэтому подталкиваем его состоянием.
      setPoints((current) => [...current]);
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      shapeRef.current = null;
      markersRef.current = [];
    };
  }, []);

  // Перерисовка контура и маркеров из состояния.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;

    void import('leaflet').then((mod) => {
      if (cancelled || !mapRef.current) return;
      const L = mod.default ?? mod;

      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      shapeRef.current?.remove();
      shapeRef.current = null;

      if (points.length >= 3) {
        shapeRef.current = L.polygon(
          points.map((p) => [p.lat, p.lon] as [number, number]),
          { color: SIGNAL, weight: 2, fillColor: SIGNAL, fillOpacity: 0.08 },
        ).addTo(map);
      } else if (points.length === 2) {
        // Двух точек мало для фигуры, но линию показать полезно:
        // видно, что первая точка не потерялась.
        shapeRef.current = L.polygon(
          points.map((p) => [p.lat, p.lon] as [number, number]),
          { color: SIGNAL, weight: 2, dashArray: '4 4', fill: false },
        ).addTo(map);
      }

      points.forEach((point, index) => {
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
          setPoints((current) =>
            current.map((item, i) => (i === index ? { lat, lon: lng } : item)),
          );
        });

        markersRef.current.push(marker);
      });

      if (shapeRef.current && !fittedRef.current) {
        fittedRef.current = true;
        map.fitBounds(shapeRef.current.getBounds(), { padding: [32, 32] });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [points]);

  const ring = toRing(points);
  const enough = points.length >= 3;
  const hasSaved = asAreaPolygon(polygon) !== null;
  const payload = enough ? JSON.stringify({ type: 'Polygon', coordinates: [ring] }) : '';

  return (
    <div className="flex flex-col gap-4">
      {state.message && (
        <Notice
          tone={state.ok ? 'strong' : undefined}
          icon={state.ok ? 'accepted' : 'upload-failed'}
        >
          {state.message}
        </Notice>
      )}

      <div
        ref={hostRef}
        className="h-[420px] w-full border border-hairline bg-canvas-deep [&_.leaflet-container]:bg-canvas-deep [&_.leaflet-tile-pane]:invert [&_.leaflet-tile-pane]:hue-rotate-180 [&_.leaflet-tile-pane]:grayscale-[0.35] [&_.leaflet-tile-pane]:brightness-[0.92] [&_.leaflet-tile-pane]:contrast-[0.9]"
        role="presentation"
      />

      <p className="text-caption text-muted">
        Клик по карте ставит точку, точку можно перетащить. Минимум три точки — контур замкнётся сам
        при сохранении.
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
                onClick={() => setPoints((current) => current.filter((_, i) => i !== index))}
                className="tap-target px-3 text-caption text-muted hover:text-signal"
              >
                <span className="sr-only">Удалить точку {index + 1}</span>
                <Icon name="remove" size={16} />
              </button>
            </li>
          ))}
        </ol>
      )}

      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="polygon" value={payload} />

        {/* Пока точек меньше трёх, сохранять нечего. Кнопка при
            этом не исчезает: с пустым списком она очищает уже
            сохранённую границу, и это законное действие. */}
        <Button type="submit" disabled={pending || (!enough && (points.length > 0 || !hasSaved))}>
          {pending ? 'Сохраняем…' : enough ? 'Сохранить границу' : 'Очистить границу'}
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={() => setPoints([])}
          disabled={points.length === 0}
        >
          Убрать все точки
        </Button>

        <span className="text-caption text-muted">
          {enough
            ? `${points.length} точек`
            : points.length === 0
              ? 'границы нет — поле описывается кругом'
              : `нужно ещё ${3 - points.length}`}
        </span>
      </form>
    </div>
  );
}
