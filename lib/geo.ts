/**
 * Расстояние между точками по формуле гаверсинуса.
 *
 * Проверка радиуса выполняется только на сервере: координаты
 * приходят с клиента и им нельзя доверять, но и отказаться от
 * них нельзя — иначе задания с привязкой к месту не работают.
 * Поэтому координаты сохраняются как заявленные, а решение
 * принимает сервер.
 */

const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;

export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface LocationCheckResult {
  ok: boolean;
  reason?: 'location_required' | 'location_too_far';
  distance?: number;
}

/**
 * Укладывается ли отправка в радиус задания.
 *
 * Погрешность геолокации прибавляется к допустимому радиусу:
 * в плотной застройке телефон легко ошибается на 30–50 метров,
 * и наказывать за это участника несправедливо.
 */
export function checkLocation(params: {
  requireLocation: boolean;
  taskLatitude: number | null;
  taskLongitude: number | null;
  radiusMeters: number | null;
  submissionLatitude?: number | null;
  submissionLongitude?: number | null;
  accuracy?: number | null;
}): LocationCheckResult {
  if (!params.requireLocation) return { ok: true };

  const { submissionLatitude, submissionLongitude } = params;
  if (submissionLatitude == null || submissionLongitude == null) {
    return { ok: false, reason: 'location_required' };
  }

  // Задание помечено как требующее геопозиции, но точка не задана —
  // это ошибка настройки, а не участника. Пропускаем.
  if (params.taskLatitude == null || params.taskLongitude == null || params.radiusMeters == null) {
    return { ok: true };
  }

  const distance = distanceMeters(
    { latitude: submissionLatitude, longitude: submissionLongitude },
    { latitude: params.taskLatitude, longitude: params.taskLongitude },
  );

  const tolerance = Math.min(params.accuracy ?? 0, 150);

  if (distance > params.radiusMeters + tolerance) {
    return { ok: false, reason: 'location_too_far', distance: Math.round(distance) };
  }

  return { ok: true, distance: Math.round(distance) };
}

// ═══ Игровое поле ═══════════════════════════════════════════

/** Кольцо GeoJSON: пары [долгота, широта], замкнутые по кругу. */
export type PolygonRing = Array<[number, number]>;

export interface AreaPolygon {
  type: 'Polygon';
  coordinates: [PolygonRing];
}

export type PlayArea =
  | { shape: 'circle'; latitude: number; longitude: number; radiusMeters: number }
  | { shape: 'polygon'; polygon: AreaPolygon; center: { latitude: number; longitude: number } };

/**
 * Игровое поле мероприятия, если оно задано.
 *
 * Три колонки заполняются только вместе — это гарантирует
 * ограничение в базе, — но типы приходят из сгенерированной
 * схемы, где каждая nullable по отдельности. Проверяем здесь,
 * чтобы дальше по коду поле было либо целым, либо отсутствующим.
 */
export function toPlayArea(event: {
  area_latitude: number | null;
  area_longitude: number | null;
  area_radius_meters: number | null;
  area_polygon?: unknown;
}): PlayArea | null {
  // Полигон точнее круга и потому важнее: если организатор
  // обвёл границу по улицам, круг рядом с ней — пережиток.
  const polygon = asAreaPolygon(event.area_polygon);
  if (polygon) {
    return { shape: 'polygon', polygon, center: ringCenter(polygon.coordinates[0]) };
  }

  const { area_latitude, area_longitude, area_radius_meters } = event;
  if (area_latitude == null || area_longitude == null || area_radius_meters == null) {
    return null;
  }
  return {
    shape: 'circle',
    latitude: area_latitude,
    longitude: area_longitude,
    radiusMeters: area_radius_meters,
  };
}

/**
 * Разбор значения из колонки `area_polygon`.
 *
 * Тот же набор требований, что и у SQL-функции
 * `is_valid_area_polygon`: испорченная граница означает, что
 * отправки перестанут приниматься у всех сразу, поэтому она
 * проверяется с обеих сторон.
 */
export function asAreaPolygon(value: unknown): AreaPolygon | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as { type?: unknown; coordinates?: unknown };
  if (candidate.type !== 'Polygon' || !Array.isArray(candidate.coordinates)) return null;
  if (candidate.coordinates.length !== 1) return null;

  const ring = candidate.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > 500) return null;

  for (const point of ring) {
    if (!Array.isArray(point) || point.length !== 2) return null;
    const [lon, lat] = point;
    if (typeof lon !== 'number' || typeof lat !== 'number') return null;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
  }

  const first = ring[0] as [number, number];
  const last = ring[ring.length - 1] as [number, number];
  if (first[0] !== last[0] || first[1] !== last[1]) return null;

  return { type: 'Polygon', coordinates: [ring as PolygonRing] };
}

/** Центр описанного прямоугольника — куда наводить карту. */
export function ringCenter(ring: PolygonRing): { latitude: number; longitude: number } {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const [lon, lat] of ring) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  return { latitude: (minLat + maxLat) / 2, longitude: (minLon + maxLon) / 2 };
}

/**
 * Точка внутри полигона — ray casting.
 *
 * Тот же алгоритм, что и в SQL-функции `point_in_area_polygon`.
 * Дублирование намеренное: клиент рисует границу и должен
 * показать вердикт сразу, а сервер обязан его перепроверить и
 * не может доверять браузеру.
 *
 * Координаты считаются плоскими: на масштабе городского центра
 * ошибка — единицы метров, меньше погрешности телефона.
 */
export function pointInPolygon(ring: PolygonRing, latitude: number, longitude: number): boolean {
  let inside = false;

  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[i + 1]!;

    if (y1 === y2) continue;

    if (y1 > latitude !== y2 > latitude) {
      const crossing = ((x2 - x1) * (latitude - y1)) / (y2 - y1) + x1;
      if (longitude < crossing) inside = !inside;
    }
  }

  return inside;
}

/** Насколько далеко точка от границы полигона, в метрах. */
function distanceToRing(ring: PolygonRing, latitude: number, longitude: number): number {
  let best = Infinity;
  for (const [lon, lat] of ring) {
    best = Math.min(
      best,
      distanceMeters({ latitude, longitude }, { latitude: lat, longitude: lon }),
    );
  }
  return best;
}

export type AreaVerdict =
  /** Поле не задано, координат нет или проверять нечего. */
  | { status: 'unknown' }
  | { status: 'inside'; distance: number }
  | { status: 'outside'; distance: number; overshoot: number };

/**
 * Где находится точка относительно игрового поля.
 *
 * Функция ничего не решает — только измеряет. Что делать с
 * ответом, зависит от режима мероприятия, и это решение принимает
 * вызывающий код, а не геометрия.
 *
 * Погрешность прибавляется к радиусу той же логикой, что и в
 * проверке задания: телефон в узкой улице ошибается на десятки
 * метров, и команда не должна за это отвечать.
 */
export function checkPlayArea(params: {
  area: PlayArea | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
}): AreaVerdict {
  const { area, latitude, longitude } = params;
  if (!area || latitude == null || longitude == null) return { status: 'unknown' };

  const tolerance = Math.min(params.accuracy ?? 0, 150);

  if (area.shape === 'polygon') {
    const ring = area.polygon.coordinates[0];
    const toBorder = distanceToRing(ring, latitude, longitude);

    if (pointInPolygon(ring, latitude, longitude)) {
      return { status: 'inside', distance: Math.round(toBorder) };
    }

    // Погрешность телефона работает и на полигоне: точка в паре
    // десятков метров снаружи с точностью ±80 м могла быть внутри.
    if (toBorder <= tolerance) {
      return { status: 'inside', distance: Math.round(toBorder) };
    }

    return {
      status: 'outside',
      distance: Math.round(toBorder),
      overshoot: Math.round(toBorder - tolerance),
    };
  }

  const distance = distanceMeters({ latitude, longitude }, area);
  const limit = area.radiusMeters + tolerance;

  if (distance > limit) {
    return {
      status: 'outside',
      distance: Math.round(distance),
      overshoot: Math.round(distance - limit),
    };
  }

  return { status: 'inside', distance: Math.round(distance) };
}
