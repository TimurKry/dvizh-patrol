import { describe, expect, it } from 'vitest';
import { checkLocation, checkPlayArea, distanceMeters, toPlayArea } from '@/lib/geo';

/** Рыночная площадь Лейпцига — точка отсчёта в тестах. */
const MARKT = { latitude: 51.3397, longitude: 12.3731 };

describe('расстояние', () => {
  it('нулевое для одной и той же точки', () => {
    expect(distanceMeters(MARKT, MARKT)).toBe(0);
  });

  it('считает короткие расстояния в городе', () => {
    // Примерно 111 метров на 0.001° широты.
    const north = { latitude: MARKT.latitude + 0.001, longitude: MARKT.longitude };
    expect(distanceMeters(MARKT, north)).toBeGreaterThan(105);
    expect(distanceMeters(MARKT, north)).toBeLessThan(120);
  });

  it('симметрично', () => {
    const other = { latitude: 51.3405, longitude: 12.3745 };
    expect(distanceMeters(MARKT, other)).toBeCloseTo(distanceMeters(other, MARKT), 6);
  });

  it('считает большие расстояния', () => {
    // Лейпциг — Берлин, около 150 км.
    const berlin = { latitude: 52.52, longitude: 13.405 };
    const km = distanceMeters(MARKT, berlin) / 1000;
    expect(km).toBeGreaterThan(140);
    expect(km).toBeLessThan(165);
  });
});

describe('проверка радиуса', () => {
  const base = {
    requireLocation: true,
    taskLatitude: MARKT.latitude,
    taskLongitude: MARKT.longitude,
    radiusMeters: 150,
  };

  it('пропускает всё, если геопозиция не требуется', () => {
    expect(checkLocation({ ...base, requireLocation: false })).toEqual({ ok: true });
  });

  it('требует координаты, когда они обязательны', () => {
    const result = checkLocation(base);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('location_required');
  });

  it('принимает точку внутри радиуса', () => {
    const result = checkLocation({
      ...base,
      submissionLatitude: MARKT.latitude + 0.0005,
      submissionLongitude: MARKT.longitude,
    });

    expect(result.ok).toBe(true);
  });

  it('отклоняет точку далеко за радиусом', () => {
    const result = checkLocation({
      ...base,
      submissionLatitude: MARKT.latitude + 0.02,
      submissionLongitude: MARKT.longitude,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('location_too_far');
    expect(result.distance).toBeGreaterThan(150);
  });

  it('прибавляет к радиусу заявленную погрешность', () => {
    // 200 метров при радиусе 150 — за границей, но погрешность
    // телефона 100 метров делает это допустимым.
    const point = {
      ...base,
      submissionLatitude: MARKT.latitude + 0.0018,
      submissionLongitude: MARKT.longitude,
    };

    expect(checkLocation(point).ok).toBe(false);
    expect(checkLocation({ ...point, accuracy: 100 }).ok).toBe(true);
  });

  it('не даёт погрешности расти бесконечно', () => {
    // Заявить точность 10 км и «попасть» откуда угодно нельзя.
    const result = checkLocation({
      ...base,
      submissionLatitude: MARKT.latitude + 0.05,
      submissionLongitude: MARKT.longitude,
      accuracy: 10_000,
    });

    expect(result.ok).toBe(false);
  });

  it('не наказывает участника за незаполненное задание', () => {
    // Организатор включил геопозицию, но не задал точку —
    // это его ошибка, а не участника.
    const result = checkLocation({
      requireLocation: true,
      taskLatitude: null,
      taskLongitude: null,
      radiusMeters: null,
      submissionLatitude: MARKT.latitude,
      submissionLongitude: MARKT.longitude,
    });

    expect(result.ok).toBe(true);
  });
});

describe('игровое поле', () => {
  const AREA = { latitude: MARKT.latitude, longitude: MARKT.longitude, radiusMeters: 1000 };

  it('собирается только из трёх заполненных колонок', () => {
    expect(
      toPlayArea({ area_latitude: 51.3, area_longitude: 12.4, area_radius_meters: 900 }),
    ).toEqual({ latitude: 51.3, longitude: 12.4, radiusMeters: 900 });

    // Радиуса нет — рисовать и проверять нечем.
    expect(
      toPlayArea({ area_latitude: 51.3, area_longitude: 12.4, area_radius_meters: null }),
    ).toBeNull();
  });

  it('без поля или без координат ничего не утверждает', () => {
    expect(checkPlayArea({ area: null, latitude: 51.3, longitude: 12.4 })).toEqual({
      status: 'unknown',
    });
    expect(checkPlayArea({ area: AREA, latitude: null, longitude: null })).toEqual({
      status: 'unknown',
    });
  });

  it('центр внутри', () => {
    const verdict = checkPlayArea({ area: AREA, ...MARKT });
    expect(verdict.status).toBe('inside');
  });

  it('точка за радиусом снаружи, и видно на сколько', () => {
    // Примерно 0.02° широты — больше двух километров на север.
    const far = { latitude: MARKT.latitude + 0.02, longitude: MARKT.longitude };
    const verdict = checkPlayArea({ area: AREA, ...far });

    expect(verdict.status).toBe('outside');
    if (verdict.status !== 'outside') return;
    expect(verdict.distance).toBeGreaterThan(2000);
    expect(verdict.overshoot).toBeGreaterThan(1000);
  });

  it('погрешность телефона играет за участника', () => {
    // 1100 метров от центра при радиусе 1000 — снаружи…
    const edge = { latitude: MARKT.latitude + 0.0099, longitude: MARKT.longitude };
    expect(checkPlayArea({ area: AREA, ...edge }).status).toBe('outside');

    // …но с честной погрешностью в 150 метров команда внутри.
    expect(checkPlayArea({ area: AREA, ...edge, accuracy: 150 }).status).toBe('inside');
  });

  it('огромная заявленная погрешность не открывает поле настежь', () => {
    // Пять километров от центра. Клиент может прислать любую
    // точность, поэтому послабление ограничено 150 метрами.
    const far = { latitude: MARKT.latitude + 0.045, longitude: MARKT.longitude };
    expect(checkPlayArea({ area: AREA, ...far, accuracy: 100000 }).status).toBe('outside');
  });
});
