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

export interface PlayArea {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

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
}): PlayArea | null {
  const { area_latitude, area_longitude, area_radius_meters } = event;
  if (area_latitude == null || area_longitude == null || area_radius_meters == null) {
    return null;
  }
  return {
    latitude: area_latitude,
    longitude: area_longitude,
    radiusMeters: area_radius_meters,
  };
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

  const distance = distanceMeters({ latitude, longitude }, area);
  const tolerance = Math.min(params.accuracy ?? 0, 150);
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
