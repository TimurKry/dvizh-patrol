import { describe, expect, it } from 'vitest';
import { checkLocation, distanceMeters } from '@/lib/geo';

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
