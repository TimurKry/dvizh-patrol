import { z } from 'zod';
import {
  LEADERBOARD_MODES,
  SCORE_TRANSACTION_TYPES,
  TASK_CATEGORIES,
  TASK_DIFFICULTIES,
  VALIDATION_MODES,
} from '@/types/database';

/**
 * Схемы валидации.
 *
 * Один и тот же модуль используется формой в браузере и серверным
 * действием. Клиентская проверка нужна для удобства, серверная —
 * для безопасности; расходиться они не могут, потому что это
 * буквально один объект.
 */

const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label}: минимум ${min} ${min === 1 ? 'символ' : 'символа'}`)
    .max(max, `${label}: не длиннее ${max} символов`);

// ═══ Регистрация команды ═══════════════════════════════════════

export const registerTeamSchema = z.object({
  teamName: trimmed(2, 60, 'Название команды'),
  captainName: trimmed(2, 60, 'Имя капитана'),
  contact: z
    .string()
    .trim()
    .max(200, 'Контакт: не длиннее 200 символов')
    .optional()
    .or(z.literal('')),
  /* Обязательное согласие. Без него участие невозможно. */
  acceptRules: z.literal(true, {
    message: 'Нужно принять правила и согласиться на обработку фотографий',
  }),
  /* Отдельный и необязательный выбор — публикация в соцсетях. */
  allowSocialPublication: z.boolean().default(false),
});

export type RegisterTeamInput = z.input<typeof registerTeamSchema>;

// ═══ Вход по коду ══════════════════════════════════════════════

/** Код показывается заглавными; ввод нормализуем сами. */
export const joinCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase().replace(/[\s-]/g, ''))
  .pipe(
    z
      .string()
      .length(6, 'Код состоит из шести символов')
      .regex(/^[A-Z0-9]{6}$/, 'В коде только латинские буквы и цифры'),
  );

export const joinTeamSchema = z.object({
  joinCode: joinCodeSchema,
  memberName: trimmed(2, 60, 'Ваше имя'),
  acceptRules: z.literal(true, {
    message: 'Нужно принять правила и согласиться на обработку фотографий',
  }),
  allowSocialPublication: z.boolean().default(false),
});

export type JoinTeamInput = z.input<typeof joinTeamSchema>;

// ═══ Отправка фотографии ═══════════════════════════════════════

export const submissionStartSchema = z.object({
  taskId: z.string().uuid('Некорректное задание'),
  /* Ключ генерирует клиент. Повтор после обрыва связи не создаёт
     вторую отправку. */
  idempotencyKey: z.string().min(8).max(64),
  contentType: z.enum(['image/webp', 'image/jpeg', 'image/png']),
  bytes: z.number().int().positive(),
});

export const submissionConfirmSchema = z.object({
  submissionId: z.string().uuid(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  locationAccuracy: z.number().nonnegative().optional(),
});

// ═══ Мероприятие ═══════════════════════════════════════════════

export const eventSettingsSchema = z.object({
  title: trimmed(2, 120, 'Название'),
  subtitle: z.string().trim().max(200).optional().or(z.literal('')),
  city: trimmed(2, 80, 'Город'),
  timezone: trimmed(3, 60, 'Часовой пояс'),
  startsAt: z.string().min(1, 'Укажите дату и время начала'),
  priceCents: z.number().int().min(0, 'Цена не может быть отрицательной'),
  maxTeams: z
    .number()
    .int()
    .min(1, 'Минимум одна команда')
    .max(10, 'Максимум десять команд'),
  teamSize: z
    .number()
    .int()
    .min(1, 'Минимум один участник')
    .max(4, 'Максимум четыре участника'),
  registrationOpen: z.boolean(),
  leaderboardMode: z.enum(LEADERBOARD_MODES),
  aiValidationEnabled: z.boolean(),
  aiAcceptThreshold: z.number().min(0).max(1),
  photoRetentionDays: z.number().int().min(1).max(3650).nullable(),

  // ─── Игровое поле ───────────────────────────────────────────
  // Три поля живут вместе: либо круг задан целиком, либо его нет.
  // То же ограничение стоит в базе, но поймать ошибку в форме
  // приятнее, чем получить отказ от Postgres.
  areaLatitude: z.number().min(-90).max(90).nullable(),
  areaLongitude: z.number().min(-180).max(180).nullable(),
  areaRadiusMeters: z
    .number()
    .int()
    .min(100, 'Радиус меньше 100 метров съест погрешность телефона')
    .max(20000, 'Максимум 20 километров')
    .nullable(),
  areaEnforced: z.boolean(),
})
  .superRefine((value, ctx) => {
    const filled = [value.areaLatitude, value.areaLongitude, value.areaRadiusMeters].filter(
      (v) => v !== null,
    ).length;

    if (filled !== 0 && filled !== 3) {
      ctx.addIssue({
        code: 'custom',
        message: 'Игровое поле задаётся тремя значениями сразу: широта, долгота и радиус',
        path: ['areaRadiusMeters'],
      });
    }

    // Строгий режим без поля потребовал бы геопозицию, не имея
    // что ею проверять, — то есть просто сломал бы отправку.
    if (value.areaEnforced && filled !== 3) {
      ctx.addIssue({
        code: 'custom',
        message: 'Строгий режим требует заданного игрового поля',
        path: ['areaEnforced'],
      });
    }
  });

// ═══ Задание ═══════════════════════════════════════════════════

export const taskSchema = z
  .object({
    number: z.number().int().positive('Номер задания начинается с единицы'),
    title: trimmed(2, 140, 'Название'),
    shortDescription: z.string().trim().max(200).optional().or(z.literal('')),
    description: trimmed(10, 4000, 'Описание'),
    points: z.number().int().min(0, 'Баллы не могут быть отрицательными').max(1000),
    category: z.enum(TASK_CATEGORIES),
    difficulty: z.enum(TASK_DIFFICULTIES),
    validationMode: z.enum(VALIDATION_MODES),
    criteria: z.array(trimmed(3, 300, 'Критерий')).max(12, 'Не больше двенадцати критериев'),
    minimumPeople: z.number().int().min(0).max(10),
    maxAttempts: z.number().int().min(1, 'Минимум одна попытка').max(10),
    requireLocation: z.boolean(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    radiusMeters: z.number().int().min(10).max(20000).nullable().optional(),
    active: z.boolean(),
    sortOrder: z.number().int().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.validationMode === 'ai' && value.criteria.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['criteria'],
        message: 'Для автоматической проверки нужен хотя бы один критерий',
      });
    }
    if (value.requireLocation) {
      if (value.latitude == null || value.longitude == null) {
        ctx.addIssue({
          code: 'custom',
          path: ['latitude'],
          message: 'Укажите координаты точки',
        });
      }
      if (value.radiusMeters == null) {
        ctx.addIssue({
          code: 'custom',
          path: ['radiusMeters'],
          message: 'Укажите радиус в метрах',
        });
      }
    }
  });

export type TaskInput = z.infer<typeof taskSchema>;

// ═══ Импорт заданий ════════════════════════════════════════════

/**
 * Формат файла импорта. Отличается от taskSchema тем, что почти
 * всё имеет значение по умолчанию: организатор не должен писать
 * пятнадцать полей ради одного задания.
 */
export const taskImportItemSchema = z
  .object({
    number: z.number().int().positive(),
    title: trimmed(2, 140, 'Название'),
    shortDescription: z.string().trim().max(200).optional(),
    description: trimmed(10, 4000, 'Описание'),
    points: z.number().int().min(0).max(1000),
    category: z.enum(TASK_CATEGORIES),
    difficulty: z.enum(TASK_DIFFICULTIES).default('medium'),
    validationMode: z.enum(VALIDATION_MODES).default('manual'),
    criteria: z.array(z.string().trim().min(3).max(300)).max(12).default([]),
    minimumPeople: z.number().int().min(0).max(10).default(0),
    maxAttempts: z.number().int().min(1).max(10).default(2),
    requireLocation: z.boolean().default(false),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    radiusMeters: z.number().int().min(10).max(20000).nullable().optional(),
    active: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.validationMode === 'ai' && value.criteria.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['criteria'],
        message: 'Режим «ai» требует хотя бы одного критерия',
      });
    }
    if (
      value.requireLocation &&
      (value.latitude == null || value.longitude == null || value.radiusMeters == null)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['requireLocation'],
        message: 'Для проверки геопозиции нужны latitude, longitude и radiusMeters',
      });
    }
  });

export type TaskImportItem = z.infer<typeof taskImportItemSchema>;

export const taskImportFileSchema = z
  .array(taskImportItemSchema)
  .min(1, 'Файл не содержит ни одного задания')
  .max(200, 'За один раз можно импортировать не больше двухсот заданий');

// ═══ Действия администратора ═══════════════════════════════════

export const reviewDecisionSchema = z.object({
  submissionId: z.string().uuid(),
  decision: z.enum(['accept', 'reject', 'retry_ai', 'request_retake']),
  points: z.number().int().min(0).max(1000).optional(),
  comment: z.string().trim().max(500).optional().or(z.literal('')),
});

export const scoreAdjustmentSchema = z.object({
  teamId: z.string().uuid(),
  points: z.number().int().min(-1000).max(1000),
  transactionType: z.enum(SCORE_TRANSACTION_TYPES).refine(
    (v) => v === 'manual_adjustment' || v === 'bonus' || v === 'penalty',
    { message: 'Допустимы только ручная корректировка, бонус и штраф' },
  ),
  reason: trimmed(3, 300, 'Причина'),
});

export const adminLoginSchema = z.object({
  email: z.string().trim().email('Некорректный email'),
  password: z.string().min(8, 'Пароль не короче восьми символов'),
});

// ═══ Утилиты ═══════════════════════════════════════════════════

/** Первое сообщение об ошибке по каждому полю — для форм. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    out[key] ??= issue.message;
  }
  return out;
}
