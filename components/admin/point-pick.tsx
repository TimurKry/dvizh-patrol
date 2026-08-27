'use client';

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, Marker, Polygon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PolygonRing } from '@/lib/geo';
import { CROSS_SIZE, crossSvg } from '@/lib/map-marker';

/**
 * Точка на карте по клику.
 *
 * Раньше координаты набирались в двух числовых полях. Это работает
 * ровно до первой опечатки: `-0,000001` вместо `51,3406` выглядит
 * как заполненное поле, проходит все проверки и ставит крест в
 * Гвинейском заливе. Заметить это можно только на карте — так
 * пусть карта и будет способом ввода.
 *
 * Клик ставит маркер, маркер перетаскивается. Числа остаются
 * видны рядом: их иногда копируют из карт, и запретить вставку
 * было бы вредно.
 *
 * Граница поля рисуется пунктиром: точка задания должна лежать
 * внутри, и без ориентира это видно только на глаз.
 */

const SIGNAL = '#ff00b3';
const CANVAS = '#060609';
const GUIDE = '#83838b';

/** Центр Лейпцига — куда смотреть, пока точки нет. */
const FALLBACK: [number, number] = [51.3397, 12.3731];

export function PointPick({
  value,
  onChange,
  guide,
  height = 'h-[320px]',
}: {
  value: { lat: number; lon: number } | null;
  onChange: (next: { lat: number; lon: number }) => void;
  guide?: PolygonRing | null;
  height?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const guideRef = useRef<Polygon | null>(null);
  const fittedRef = useRef(false);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || mapRef.current) return;

    let cancelled = false;

    void import('leaflet').then((mod) => {
      if (cancelled || !hostRef.current) return;
      const L = mod.default ?? mod;

      const map = L.map(host, { zoomControl: true, scrollWheelZoom: false });
      map.setView(valueRef.current ? [valueRef.current.lat, valueRef.current.lon] : FALLBACK, 15);

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map);

      map.on('click', (event: { latlng: { lat: number; lng: number } }) => {
        if (mapRef.current !== map) return;
        onChangeRef.current({ lat: event.latlng.lat, lon: event.latlng.lng });
      });

      mapRef.current = map;
      redraw(L, map);
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      guideRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function redraw(L: typeof import('leaflet'), map: LeafletMap) {
    guideRef.current?.remove();
    guideRef.current = null;
    markerRef.current?.remove();
    markerRef.current = null;

    if (guide && guide.length >= 4) {
      guideRef.current = L.polygon(
        guide.map(([lon, lat]) => [lat, lon] as [number, number]),
        { color: GUIDE, weight: 1, dashArray: '6 6', fill: false, interactive: false },
      ).addTo(map);
    }

    const point = valueRef.current;
    if (point) {
      // Крест — тот же знак и тот же код, что у команды на её
      // карте. Раньше здесь был квадрат с `clip-path`, и сборка
      // выбрасывала это свойство из строки со стилем: маркер
      // приезжал в браузер прозрачным. См. lib/map-marker.
      markerRef.current = L.marker([point.lat, point.lon], {
        draggable: true,
        keyboard: true,
        title: 'Точка задания',
        icon: L.divIcon({
          className: '',
          html: crossSvg(SIGNAL, CANVAS),
          iconSize: [CROSS_SIZE, CROSS_SIZE],
          iconAnchor: [CROSS_SIZE / 2, CROSS_SIZE / 2],
        }),
      }).addTo(map);

      markerRef.current.on('dragend', () => {
        const { lat, lng } = markerRef.current!.getLatLng();
        onChangeRef.current({ lat, lon: lng });
      });
    }

    if (!fittedRef.current) {
      fittedRef.current = true;
      if (point) map.setView([point.lat, point.lon], 16);
      else if (guideRef.current) map.fitBounds(guideRef.current.getBounds(), { padding: [32, 32] });
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
  }, [value, guide]);

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={hostRef}
        className={`${height} w-full border border-hairline bg-canvas-deep [&_.leaflet-container]:bg-canvas-deep [&_.leaflet-tile-pane]:invert [&_.leaflet-tile-pane]:hue-rotate-180 [&_.leaflet-tile-pane]:grayscale-[0.35] [&_.leaflet-tile-pane]:brightness-[0.92] [&_.leaflet-tile-pane]:contrast-[0.9]`}
        role="presentation"
      />
      <p className="text-caption text-muted">
        Клик по карте ставит крест, крест можно перетащить.
        {guide && ' Пунктиром показана граница игрового поля.'}
      </p>
    </div>
  );
}
