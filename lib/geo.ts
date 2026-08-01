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

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

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
