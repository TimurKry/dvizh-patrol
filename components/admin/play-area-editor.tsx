'use client';

import { useActionState, useState } from 'react';
import { savePlayAreaAction, type AdminActionState } from '@/actions/admin';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/feedback';
import { PolygonDraw, toRing, type DrawPoint } from '@/components/admin/polygon-draw';
import { asAreaPolygon } from '@/lib/geo';

/**
 * Редактор игрового поля · Figma 155:404.
 *
 * Рисование живёт в `PolygonDraw` — том же компоненте, которым
 * задаётся область отдельного задания. Здесь остаётся то, что
 * специфично для границы поля: сохранение, очистка и правило
 * «пока точек меньше трёх, сохранять нечего».
 *
 * Сохранение отправляет GeoJSON серверу, который проверяет его
 * заново: браузеру здесь не доверяют.
 */

const INITIAL: AdminActionState = { ok: false };

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

  const [points, setPoints] = useState<DrawPoint[]>(() => {
    const parsed = asAreaPolygon(polygon);
    if (!parsed) return [];
    // Замыкающая точка — деталь формата, а не отдельный угол.
    return parsed.coordinates[0].slice(0, -1).map(([lon, lat]) => ({ lat, lon }));
  });

  const enough = points.length >= 3;
  const hasSaved = asAreaPolygon(polygon) !== null;
  const payload = enough
    ? JSON.stringify({ type: 'Polygon', coordinates: [toRing(points)] })
    : '';

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

      <PolygonDraw points={points} onChange={setPoints} />

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
