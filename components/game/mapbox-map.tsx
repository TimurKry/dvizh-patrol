'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as MapboxGlMap, Marker as MapboxMarker } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Button } from '@/components/ui/button';
import type { PlayArea } from '@/lib/geo';
import type { MapPoint } from './quest-map';

/**
 * Карта на Mapbox GL: тёмная подложка, объёмные дома, наклон.
 *
 * Зачем вообще вторая карта. Leaflet рисует растровые тайлы
 * OpenStreetMap — это работает и ничего не стоит, но выглядит как
 * обычная карта: пёстрая, плоская, без единого отношения к
 * палитре. Здесь же половина впечатления от квеста — как он
 * выглядит на телефоне в руках у человека посреди города.
 *
 * Что даёт «дорогой» вид, по убыванию вклада:
 *
 *   1. объёмные дома — стиль Standard рисует их сам;
 *   2. наклон камеры: сверху вниз любая карта плоская;
 *   3. ночной пресет освещения вместо просто тёмных тайлов —
 *      у домов появляются грани и тени;
 *   4. один акцентный цвет на всё: поле, кресты, районы.
 *
 * Leaflet при этом никуда не делся. Без токена — а его может не
 * быть на превью, у него может кончиться квота, его могут
 * отозвать — приложение возвращается к нему само. Карта на
 * квесте нужнее красивой карты.
 */

const SIGNAL = '#ff00b3';
const INK = '#f5f5f1';
const CANVAS = '#060609';

const FALLBACK = { latitude: 51.3397, longitude: 12.3731 };

/** Слой поля кладётся под дома: иначе заливка накроет город. */
const AREA_SLOT = 'bottom';

export function MapboxMap({
  token,
  area,
  points,
  className,
  showLocateButton = true,
}: {
  token: string;
  area: PlayArea | null;
  points: MapPoint[];
  className?: string;
  showLocateButton?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxGlMap | null>(null);
  const meRef = useRef<MapboxMarker | null>(null);

  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let map: MapboxGlMap | null = null;

    void (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;
      if (cancelled || !hostRef.current) return;

      mapboxgl.accessToken = token;

      const center: [number, number] = area
        ? area.shape === 'circle'
          ? [area.longitude, area.latitude]
          : [area.center.longitude, area.center.latitude]
        : [FALLBACK.longitude, FALLBACK.latitude];

      map = new mapboxgl.Map({
        container: hostRef.current,
        style: 'mapbox://styles/mapbox/standard',
        center,
        zoom: 14.2,
        // Наклон и поворот — то, ради чего всё и затевалось.
        // Строго сверху карта выглядит плоской при любом стиле.
        pitch: 55,
        bearing: -18,
        attributionControl: true,
        // Клавиатурное управление оставляем: карта — не картинка,
        // и стрелками по ней должно двигаться.
        cooperativeGestures: false,
      });

      mapRef.current = map;

      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-left');

      map.on('style.load', () => {
        if (!map) return;

        // Ночь: у домов появляются грани, город перестаёт быть
        // однотонной кашей. Пресет — часть стиля Standard, своих
        // слоёв освещения заводить не нужно.
        map.setConfigProperty('basemap', 'lightPreset', 'night');
        map.setConfigProperty('basemap', 'showPointOfInterestLabels', false);
        map.setConfigProperty('basemap', 'showTransitLabels', false);

        if (area) {
          const ring: [number, number][] =
            area.shape === 'circle'
              ? circleRing(area.longitude, area.latitude, area.radiusMeters)
              : area.polygon.coordinates[0].map(([lng, lat]) => [lng, lat]);

          map.addSource('play-area', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'Polygon', coordinates: [ring] },
            },
          });

          map.addLayer({
            id: 'play-area-fill',
            type: 'fill',
            source: 'play-area',
            slot: AREA_SLOT,
            paint: { 'fill-color': SIGNAL, 'fill-opacity': 0.16 },
          });

          map.addLayer({
            id: 'play-area-line',
            type: 'line',
            source: 'play-area',
            slot: AREA_SLOT,
            paint: { 'line-color': SIGNAL, 'line-width': 2, 'line-opacity': 0.9 },
          });
        }

        for (const point of points) {
          const el = document.createElement('div');
          el.innerHTML = point.kind === 'zone' ? zoneHtml(point) : crossHtml(point);
          new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([point.longitude, point.latitude])
            .setPopup(new mapboxgl.Popup({ offset: 22 }).setHTML(popupHtml(point)))
            .addTo(map);
        }

        // Кадр по содержимому: поле важнее заданий, оно и задаёт
        // границы. Точки без поля — тоже повод подвинуть камеру.
        const box = boundsOf(area, points);
        if (box) {
          map.fitBounds(box, { padding: 48, pitch: 55, bearing: -18, duration: 0 });
        }
      });
    })();

    return () => {
      cancelled = true;
      meRef.current?.remove();
      meRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
  }, [token, area, points]);

  async function locate() {
    const map = mapRef.current;
    if (!map || !navigator.geolocation) {
      setLocationError('Браузер не умеет определять местоположение.');
      return;
    }

    setLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const mapboxgl = (await import('mapbox-gl')).default;
        const { latitude, longitude } = position.coords;

        meRef.current?.remove();

        const el = document.createElement('div');
        el.innerHTML =
          `<span style="display:block;width:18px;height:18px;border-radius:9999px;` +
          `background:${INK};border:3px solid ${CANVAS};box-shadow:0 0 0 6px rgba(245,245,241,.18)"></span>`;

        meRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([longitude, latitude])
          .addTo(map);

        map.easeTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), 15.5) });
        setLocating(false);
      },
      () => {
        setLocationError('Не удалось определить местоположение. Проверьте разрешение в браузере.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div ref={hostRef} className={className ?? 'h-[360px]'} />

      {showLocateButton && (
        <div className="flex flex-col gap-2">
          <Button variant="secondary" onClick={locate} disabled={locating} className="self-start">
            {locating ? 'Определяем…' : 'Где я'}
          </Button>
          {locationError && <p className="text-caption text-muted">{locationError}</p>}
        </div>
      )}
    </div>
  );
}

/** Круг из 0007 — многоугольником: у Mapbox своего круга нет. */
function circleRing(lng: number, lat: number, radiusMeters: number): [number, number][] {
  const steps = 64;
  const dLat = radiusMeters / 111_320;
  const dLng = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return ring;
}

function boundsOf(area: PlayArea | null, points: MapPoint[]): [[number, number], [number, number]] | null {
  const coords: [number, number][] = [];

  if (area) {
    if (area.shape === 'circle') {
      coords.push(...circleRing(area.longitude, area.latitude, area.radiusMeters));
    } else {
      for (const [lng, lat] of area.polygon.coordinates[0]) coords.push([lng, lat]);
    }
  }
  for (const p of points) coords.push([p.longitude, p.latitude]);
  if (coords.length === 0) return null;

  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
