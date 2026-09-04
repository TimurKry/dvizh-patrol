import { z } from 'zod';
import {
  LEADERBOARD_MODES,
  SCORE_TRANSACTION_TYPES,
  TASK_CARD_TYPES,
  TASK_CATEGORIES,
  TASK_DIFFICULTIES,
  TASK_MAP_MODES,
  VALIDATION_MODES,
} from '@/types/database';
import { asAreaPolygon } from '@/lib/geo';
import { TASK_FIELD_LABELS } from '@/lib/messages';

/**
 * Схемы валидации.
 *
 * Один и тот же модуль используется формой в браузере и серверным
 * действием. Клиентская проверка нужна для удобства, серверная —
 * для безопасности; расходиться они не могут, потому что это
 * буквально один объект.
 */

/** Необязательное короткое поле: пусто — законное значение. */
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));

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

// ═══ Отказ от карточки ═════════════════════════════════════════

export const declineTaskSchema = z.object({
  taskId: z.string().uuid('Некорректное задание'),
});

// ═══ Мероприятие ═══════════════════════════════════════════════

export const eventSettingsSchema = z
  .object({
    title: trimmed(2, 120, 'Название'),
    subtitle: z.string().trim().max(200).optional().or(z.literal('')),
    city: trimmed(2, 80, 'Город'),
    timezone: trimmed(3, 60, 'Часовой пояс'),
    startsAt: z.string().min(1, 'Укажите дату и время начала'),
    priceCents: z.number().int().min(0, 'Цена не может быть отрицательной'),
    maxTeams: z.number().int().min(1, 'Минимум одна команда').max(10, 'Максимум десять команд'),
    teamSize: z.number().int().min(1, 'Минимум один участник').max(6, 'Максимум шесть участников'),
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

    // ─── Конец игры и место сбора ───────────────────────────────
    // Пустое время конца — законное значение: квест завершается
    // кнопкой организатора. Заданное — закрывает приём отправок,
    // и это правило проверяется в базе, а не только здесь.
    endsAt: z.string().nullable(),
    finishLatitude: z.number().min(-90).max(90).nullable(),
    finishLongitude: z.number().min(-180).max(180).nullable(),
    finishTitle: optionalText(120),
    finishAddress: optionalText(200),
    finishNote: optionalText(600),
    finishAt: z.string().nullable(),
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

    // Конец раньше начала — почти всегда описка в дате, а не
    // намерение. То же ограничение стоит в базе.
    if (value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Конец игры должен быть позже старта',
        path: ['endsAt'],
      });
    }

    if (value.finishAt && new Date(value.finishAt) <= new Date(value.startsAt)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Встреча после игры, а не до неё',
        path: ['finishAt'],
      });
    }

    // Половина координаты — это не место, а ошибка ввода.
    if ((value.finishLatitude === null) !== (value.finishLongitude === null)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Точка сбора задаётся парой координат. Поставьте её кликом по карте',
        path: ['finishLatitude'],
      });
    }
  });

// ═══ Задание ═══════════════════════════════════════════════════

/**
 * Поля, общие для формы и импорта.
 *
 * Держатся вместе, потому что расходятся они молча: поле,
 * добавленное только в форму, приезжает из файла пустым, и
 * организатор узнаёт об этом, когда половина заданий уже залита.
 */

const taskExtrasShape = {
  mapMode: z.enum(TASK_MAP_MODES),
  /** Приходит разобранным JSON; форма шлёт строкой, импорт — объектом. */
  areaPolygon: z.unknown().optional(),
  imageCaption: optionalText(60),
  /**
   * 0 означает «не показывать»: пустой select не отправить, а в
   * файле импорта колонки может не быть вовсе.
   */
  landingSlot: z.number().int().min(0).max(3).default(0),
  backstory: optionalText(2000),
  afterword: optionalText(2000),
  afterwordUrl: optionalText(500),
  afterwordUrlLabel: optionalText(80),
};

/**
 * Проверки, которые нельзя выразить формой поля.
 *
 * Режим карты обязан быть обеспечен данными: точка без координат
 * и область без контура рисуют пустоту, и узнаёт об этом
 * организатор от команды посреди квеста. В базе стоят такие же
 * ограничения — здесь они ради внятного сообщения, а не вместо.
 */
function checkTaskExtras(
  value: {
    mapMode: string;
    areaPolygon?: unknown;
    latitude?: number | null;
    longitude?: number | null;
    afterwordUrl?: string;
    afterwordUrlLabel?: string;
  },
  ctx: z.RefinementCtx,
): void {
  if (value.mapMode === 'point' && (value.latitude == null || value.longitude == null)) {
    ctx.addIssue({
      code: 'custom',
      path: ['latitude'],
      message: 'Для точки на карте нужны координаты',
    });
  }

  if (value.mapMode === 'area' && !asAreaPolygon(value.areaPolygon)) {
    ctx.addIssue({
      code: 'custom',
      path: ['areaPolygon'],
      message: 'Нарисуйте область: замкнутый контур минимум из трёх точек',
    });
  }

  if (value.afterwordUrl && !value.afterwordUrl.startsWith('https://')) {
    ctx.addIssue({
      code: 'custom',
      path: ['afterwordUrl'],
      message: 'Ссылка должна начинаться с https://',
    });
  }

  if (value.afterwordUrlLabel && !value.afterwordUrl) {
    ctx.addIssue({
      code: 'custom',
      path: ['afterwordUrl'],
      message: 'Подпись есть, а ссылки нет',
    });
  }
}

export const taskSchema = z
  .object({
    number: z.number().int().positive('Номер задания начинается с единицы'),
    title: trimmed(2, 140, 'Название'),
    shortDescription: z.string().trim().max(200).optional().or(z.literal('')),
    description: trimmed(10, 4000, 'Описание'),
    points: z.number().int().min(0, 'Баллы не могут быть отрицательными').max(1000),
    category: z.enum(TASK_CATEGORIES),
    // Тип карточки определяет, в какую треть руки попадёт задание.
    cardType: z.enum(TASK_CARD_TYPES),
    difficulty: z.enum(TASK_DIFFICULTIES),
    validationMode: z.enum(VALIDATION_MODES),
    criteria: z.array(trimmed(3, 300, 'Критерий')).max(12, 'Не больше двенадцати критериев'),
    hiddenCriteria: z
      .array(trimmed(3, 300, 'Скрытый критерий'))
      .max(12, 'Не больше двенадцати скрытых критериев'),
    minimumPeople: z.number().int().min(0).max(10),
    maxAttempts: z.number().int().min(1, 'Минимум одна попытка').max(10),
    requireLocation: z.boolean(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    radiusMeters: z.number().int().min(10).max(20000).nullable().optional(),
    active: z.boolean(),
    sortOrder: z.number().int().optional(),
    ...taskExtrasShape,
  })
  .superRefine((value, ctx) => {
    checkTaskExtras(value, ctx);
    // Модели всё равно, какой критерий открытый, а какой скрытый —
    // она проверяет и те, и другие. Поэтому у загадки достаточно
    // одних скрытых: открытые там называли бы ответ.
    if (
      value.validationMode === 'ai' &&
      value.criteria.length === 0 &&
      value.hiddenCriteria.length === 0
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['criteria'],
        message: 'Для автоматической проверки нужен хотя бы один критерий — открытый или скрытый',
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
    // В импорте тип необязателен: файлы организатора старше этой
    // колонки, и падать из-за неё импорт не должен.
    cardType: z.enum(TASK_CARD_TYPES).default('photo'),
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
    ...taskExtrasShape,
    // В импорте режим карты необязателен: файлы организатора
    // старше этой колонки. По умолчанию — как было до 0014.
    mapMode: z.enum(TASK_MAP_MODES).default('none'),
  })
  .superRefine((value, ctx) => {
    checkTaskExtras(value, ctx);
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
  transactionType: z
    .enum(SCORE_TRANSACTION_TYPES)
    .refine((v) => v === 'manual_adjustment' || v === 'bonus' || v === 'penalty', {
      message: 'Допустимы только ручная корректировка, бонус и штраф',
    }),
  reason: trimmed(3, 300, 'Причина'),
});

export const adminLoginSchema = z.object({
  email: z.string().trim().email('Некорректный email'),
  password: z.string().min(8, 'Пароль не короче восьми символов'),
});

// ═══ Утилиты ═══════════════════════════════════════════════════

/** Первое сообщение об ошибке по каждому полю — для форм. */
/**
 * Провал проверки формы задания — с текстом, а не одними пометками
 * у полей.
 *
 * Форма задания длиннее экрана: кнопка «Создать задание» внизу,
 * обязательное «Полное описание» — вверху. Возвращая только
 * `fields`, действие оставляло организатора перед формой, которая
 * на нажатие не отвечает ничем видимым: подпись об ошибке
 * появлялась там, куда он в этот момент не смотрит. Со стороны это
 * выглядело как «задание не создаётся» — при том, что вставки
 * действительно не было, и в базе не появлялось ничего.
 *
 * Теперь ошибка называет поля по именам, а форма подматывает к
 * первому из них.
 */
export function taskValidationReport(error: z.ZodError): {
  message: string;
  fields: Record<string, string>;
} {
  const fields = fieldErrors(error);
  const names = Object.keys(fields).map((key) => TASK_FIELD_LABELS[key] ?? key);

  return {
    fields,
    message:
      names.length === 1
        ? `Задание не сохранено: поле «${names[0]}» заполнено неверно.`
        : `Задание не сохранено: проверьте поля — ${names.join(', ')}.`,
  };
}

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    out[key] ??= issue.message;
  }
  return out;
}
