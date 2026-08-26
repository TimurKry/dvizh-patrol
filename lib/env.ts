import 'server-only';
import { z } from 'zod';

/**
 * Переменные окружения.
 *
 * Читаются один раз и проверяются схемой. Всё, что относится
 * к AI, необязательно: без ключа приложение обязано работать,
 * просто фотографии уходят организатору.
 *
 * Модуль помечен server-only — попадание SUPABASE_SERVICE_ROLE_KEY
 * в клиентский бандл невозможно по построению.
 */

const boolFromEnv = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v.trim() === '') return fallback;
      return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
    });

const intFromEnv = (fallback: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v.trim() === '') return fallback;
      const n = Number.parseInt(v, 10);
      return Number.isFinite(n) ? n : fallback;
    })
    .pipe(z.number().int().min(min).max(max));

const floatFromEnv = (fallback: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v.trim() === '') return fallback;
      const n = Number.parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    })
    .pipe(z.number().min(min).max(max));

const optionalText = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z
    .string()
    .optional()
    .transform((v) =>
      v && v.trim() !== '' ? v.trim().replace(/\/+$/, '') : 'http://localhost:3000',
    ),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL должен быть валидным URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY не задан'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, 'SUPABASE_SERVICE_ROLE_KEY не задан'),

  ADMIN_EMAIL: optionalText,

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET должен быть не короче 32 символов'),

  WORKER_SECRET: optionalText,

  GEMINI_API_KEY: optionalText,
  /**
   * Модель проверки.
   *
   * Значение по умолчанию приходится обновлять: Google закрывает
   * старые модели для новых ключей, не трогая старые. Так и вышло
   * с `gemini-2.5-flash` — ключ был рабочий, а модель для него уже
   * не существовала, и каждая фотография уходила в ручную проверку
   * с HTTP 404. Проверяется кнопкой «Проверить связь с ИИ» в
   * настройках; переопределяется переменной без пересборки.
   */
  GEMINI_MODEL: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== '' ? v.trim() : 'gemini-3.6-flash')),

  AI_VALIDATION_ENABLED: boolFromEnv(true),
  /**
   * Порог принятия для новых мероприятий.
   *
   * Был 0.88 — судья-перестраховщик. На боевой проверке это дало
   * ровно то, чего организатор не может себе позволить: годная
   * фотография с уверенностью 0.75 легла к нему в очередь. Вечером
   * квеста разбирать её будет некому.
   *
   * Порог опущен до 0.5 сознательно: ошибочно принятая фотография
   * поправима (отклонение снимает баллы обратной транзакцией),
   * а потерянный вечер организатора — нет.
   */
  AI_ACCEPT_THRESHOLD: floatFromEnv(0.5, 0, 1),
  /**
   * Сколько ждать модель.
   *
   * 20 секунд хватало на `gemini-2.5-flash`; третье поколение
   * размышляет перед ответом, и на них каждая фотография уходила
   * в ручную проверку по таймауту. Даже с `thinkingLevel: low`
   * запас нужен больший.
   *
   * Потолок держит `maxDuration` функций: 60 с у подтверждения
   * отправки, 120 с у обработчика очереди. Пачка идёт параллельно,
   * поэтому 45 с — это время одной проверки, а не всей пачки.
   */
  AI_REQUEST_TIMEOUT_MS: intFromEnv(45_000, 1_000, 120_000),
  AI_MAX_CONCURRENCY: intFromEnv(4, 1, 6),
  AI_STALE_CHECK_MINUTES: intFromEnv(5, 1, 120),
  AI_MAX_ATTEMPTS: intFromEnv(2, 1, 5),

  TEAM_SESSION_TTL_HOURS: intFromEnv(72, 1, 8_760),
  SIGNED_URL_TTL_SECONDS: intFromEnv(3_600, 60, 604_800),
  MAX_UPLOAD_SIZE_MB: intFromEnv(3, 1, 20),
  MAX_IMAGE_LONG_EDGE: intFromEnv(1_600, 640, 4_096),
  PHOTO_RETENTION_DAYS: intFromEnv(30, 1, 3_650),

  /** Версия политики, под которой собираются согласия. */
  POLICY_VERSION: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== '' ? v.trim() : '2026-08-01')),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

function read(): Env {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  · ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Некорректная конфигурация окружения.\n${details}\n\n` +
        'Проверьте .env.local — образец в .env.example.',
    );
  }

  return parsed.data;
}

export function env(): Env {
  cached ??= read();
  return cached;
}

/**
 * Доступна ли автоматическая проверка.
 *
 * Три условия: проверка включена флагом, ключ задан, модель
 * известна. Если хотя бы одно не выполнено — работаем вручную,
 * и это штатный режим, а не авария.
 */
export function isAiConfigured(): boolean {
  const e = env();
  return e.AI_VALIDATION_ENABLED && Boolean(e.GEMINI_API_KEY);
}

/** Ограничение размера загружаемого файла в байтах. */
export function maxUploadBytes(): number {
  return env().MAX_UPLOAD_SIZE_MB * 1024 * 1024;
}
