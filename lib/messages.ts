import type { IconName } from '@/components/ui/icon';
/**
 * Тексты для пользователя. Все — на русском.
 *
 * Коды ошибок приходят из SQL-функций и серверных проверок;
 * здесь они превращаются в человеческие формулировки. Технические
 * подробности («database_error», «ai_invalid_response») наружу
 * не показываем: участник на улице ничего не может с ними сделать.
 */

import type {
  SubmissionStatus,
  TaskCardType,
  TaskCategory,
  TaskDifficulty,
  TaskMapMode,
} from '@/types/database';

export const ERROR_MESSAGES: Record<string, string> = {
  // Регистрация и вход
  event_not_found: 'Мероприятие не найдено.',
  registration_closed: 'Регистрация команд сейчас закрыта.',
  event_full: 'Регистрация команд завершена — все доступные места заняты.',
  team_name_taken: 'Команда с таким названием уже зарегистрирована. Придумайте другое.',
  join_code_generation_failed: 'Не удалось создать код команды. Попробуйте ещё раз.',
  invalid_join_code: 'Такого кода не существует. Проверьте все шесть символов и раскладку.',
  team_cancelled: 'Регистрация этой команды отменена. Свяжитесь с организатором.',
  team_full: 'В этой команде уже находится максимальное количество участников.',
  event_not_joinable: 'К этому мероприятию сейчас нельзя присоединиться.',

  // Задания и отправки
  team_not_found: 'Команда не найдена.',
  task_not_found: 'Задание не найдено.',
  task_event_mismatch: 'Задание относится к другому мероприятию.',
  task_inactive: 'Это задание сейчас недоступно.',
  task_not_available_yet: 'Задание ещё не открыто.',
  task_no_longer_available: 'Время выполнения этого задания истекло.',
  event_not_live: 'Квест ещё не начался или уже завершён.',
  event_paused: 'Квест приостановлен организатором. Отправки временно недоступны.',
  event_over: 'Время вышло — отправки закрыты. Идите к месту сбора.',
  already_accepted: 'Это задание уже засчитано вашей команде.',
  attempt_limit_reached: 'Попытки по этому заданию закончились.',
  submission_not_found: 'Отправка не найдена.',
  task_already_accepted: 'По этому заданию уже принята другая фотография.',
  task_claimed_by_other_team:
    'Это задание успела забрать другая команда. Карточка уходит из руки, вместо неё придёт новая.',

  unknown_access: 'Неизвестный режим доступа команды.',
  decline_unavailable: 'В этом режиме карточку вернуть нельзя.',

  // Отказ от карточки
  task_not_on_hand: 'Этой карточки нет у вас на руке.',
  task_already_attempted:
    'По этому заданию уже отправлена фотография — вернуть карточку в колоду больше нельзя.',
  no_replacement:
    'Свободных заданий этого типа не осталось: менять карточку не на что, поэтому она остаётся у вас.',

  // Файлы
  invalid_file_type: 'Можно загружать только изображения.',
  file_too_large: 'Файл слишком большой. Уменьшите качество и попробуйте снова.',
  file_missing: 'Файл не получен. Попробуйте ещё раз.',
  upload_failed: 'Не удалось загрузить фотографию. Проверьте связь и повторите.',
  storage_object_missing: 'Файл не долетел до сервера. Отправьте фотографию ещё раз.',

  // Геолокация
  location_required: 'Для этого задания нужно разрешить доступ к геопозиции.',
  location_too_far: 'Вы слишком далеко от нужной точки.',
  area_location_required:
    'На этом квесте фотографии принимаются только внутри игрового поля — разрешите доступ к геопозиции.',
  outside_play_area: 'Вы за пределами игрового поля. Вернитесь внутрь круга на карте.',
  location_denied: 'Доступ к геопозиции отклонён.',

  // Права и общие
  unauthorized: 'Нужно войти в команду.',
  forbidden: 'Недостаточно прав.',
  rate_limited: 'Слишком много попыток. Подождите немного.',
  validation_failed: 'Проверьте правильность заполнения формы.',
  database_error: 'Сервис временно недоступен. Попробуйте ещё раз через минуту.',
  unknown_error: 'Что-то пошло не так. Попробуйте ещё раз.',
  negative_points: 'Количество баллов не может быть отрицательным.',
  reason_required: 'Укажите причину.',
  invalid_transaction_type: 'Недопустимый тип начисления.',
  invalid_mode: 'Недопустимый режим рейтинга.',
};

export function errorMessage(code: string | undefined | null): string {
  if (!code) return ERROR_MESSAGES.unknown_error!;
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.unknown_error!;
}

// ═══ Статусы отправок ══════════════════════════════════════════

interface StatusPresentation {
  label: string;
  /** Что это означает для участника. */
  hint: string;
  /** Значок — статус не должен различаться только цветом. */
  icon: IconName;
}

export const SUBMISSION_STATUS_TEXT: Record<SubmissionStatus, StatusPresentation> = {
  draft: {
    label: 'Черновик',
    hint: 'Фотография выбрана, но ещё не отправлена.',
    icon: 'draft',
  },
  uploading: {
    label: 'Загружается',
    hint: 'Идёт загрузка. Не закрывайте страницу.',
    icon: 'uploading',
  },
  pending: {
    label: 'Ожидает проверки',
    hint: 'Фото загружено и отправлено на проверку. Можно продолжать квест.',
    icon: 'pending',
  },
  checking: {
    label: 'Проверяется',
    hint: 'Идёт автоматическая проверка.',
    icon: 'checking',
  },
  accepted: {
    label: 'Принято',
    hint: 'Задание засчитано, баллы начислены.',
    icon: 'accepted',
  },
  manual_review: {
    label: 'Ручная проверка',
    hint: 'Фотография ожидает решения организатора.',
    icon: 'manual-review',
  },
  rejected: {
    label: 'Отклонено',
    hint: 'Организатор не засчитал эту фотографию.',
    icon: 'rejected',
  },
  upload_failed: {
    label: 'Не загрузилось',
    hint: 'Файл не сохранился. Попробуйте отправить снова.',
    icon: 'upload-failed',
  },
  cancelled: {
    label: 'Отменено',
    hint: 'Отправка отменена организатором.',
    icon: 'cancelled',
  },
};

export const REVIEW_REASON_TEXT: Record<string, string> = {
  possible_duplicate: 'Похожа на другую фотографию',
  ai_low_confidence: 'Автоматическая проверка не уверена',
  ai_unavailable: 'Автоматическая проверка недоступна',
  ai_invalid_response: 'Некорректный ответ проверки',
  ai_error: 'Сбой автоматической проверки',
  manual_mode: 'Задание проверяется вручную',
  criterion_failed: 'Не выполнен обязательный критерий',
  outside_play_area: 'Снято за пределами игрового поля',
  area_location_required: 'Не удалось подтвердить, что снимок сделан внутри поля',
};

/**
 * Служебные причины начисления.
 *
 * В журнал баллов причина пишется всегда: организатору важно
 * знать, кто засчитал отправку — модель, человек или разбор
 * очереди пачкой. Команде это ничего не говорит, а под строкой
 * «Задание принято» выглядит как утёкший наружу код: на экране
 * состава так и стояло «ai_validation».
 *
 * Поэтому машинные причины участнику не показываем. Всё
 * остальное — текст, который организатор написал руками, — он
 * писал именно для команды, и его видно.
 */
const MACHINE_REASONS = new Set([
  'ai_validation',
  'manual_review',
  'bulk_accept',
  'task_accepted',
  'submission_revoked',
  'accepted',
  'revoked',
]);

export function participantReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return MACHINE_REASONS.has(reason) ? null : reason;
}

// ═══ Задания ═══════════════════════════════════════════════════

export const TASK_CATEGORY_TEXT: Record<TaskCategory, string> = {
  monuments: 'Памятники',
  road_signs: 'Дорожные знаки',
  advertising: 'Реклама',
  interaction: 'Взаимодействие',
  object_search: 'Поиск объектов',
  team: 'Командные',
  creative: 'Творческие',
  special: 'Особые',
};

/**
 * Тип карточки.
 *
 * Рисунок знака живёт в `components/game/task-type-icon`; здесь
 * только слова. `place` — то, что тип обещает про место, и это
 * не украшение: от типа зависит, что команда увидит на карте.
 *
 *   загадка   — примерный район, точки нет: иначе карта решала бы
 *               загадку за команду;
 *   фото      — точный крест, к нему и надо дойти;
 *   актив     — места нет вовсе, делается где угодно в поле.
 */
export const TASK_CARD_TYPE_TEXT: Record<
  TaskCardType,
  { label: string; hint: string; place: string }
> = {
  riddle: {
    label: 'Загадка',
    hint: 'Найти объект по описанию.',
    place: 'Примерный район',
  },
  photo: {
    label: 'Фото-повтор',
    hint: 'Повторить то, что видно.',
    place: 'Точка на карте',
  },
  active: {
    label: 'Актив',
    hint: 'Сделать что-то в городе.',
    place: 'Где угодно в поле',
  },
};

/**
 * Что задание обещает про карту.
 *
 * До 0014 это выводилось из типа карточки, и выбора не было.
 * Теперь режим отдельный, а `place` из `TASK_CARD_TYPE_TEXT`
 * остаётся только для витрины лендинга, где карты нет вовсе.
 */
export const TASK_MAP_MODE_TEXT: Record<
  TaskMapMode,
  { label: string; place: string; hint: string }
> = {
  none: {
    label: 'Без карты',
    place: 'Где угодно в поле',
    hint: 'Задание не привязано к месту и на карте не появится.',
  },
  point: {
    label: 'Точка',
    place: 'Точка на карте',
    hint: 'Крест по координатам: команда знает, куда идти.',
  },
  area: {
    label: 'Область',
    place: 'Обведённый район',
    hint: 'Контур без центра: точное место остаётся ответом.',
  },
};

/**
 * Названия полей формы задания — для сообщения об ошибке.
 *
 * Форма длинная: кнопка «Создать задание» стоит внизу, а
 * незаполненное описание — вверху, и подпись под полем оттуда не
 * видно. Нажатие выглядело как «ничего не произошло». Поэтому
 * ошибка называет поля по именам сразу над кнопкой.
 *
 * Ключи — пути из схемы, они же ключи `state.fields`.
 */
export const TASK_FIELD_LABELS: Record<string, string> = {
  number: 'Номер',
  title: 'Название',
  shortDescription: 'Краткое описание',
  description: 'Полное описание',
  points: 'Баллы',
  category: 'Категория',
  cardType: 'Тип карточки',
  difficulty: 'Сложность',
  validationMode: 'Режим проверки',
  criteria: 'Критерии проверки',
  hiddenCriteria: 'Скрытые критерии',
  minimumPeople: 'Минимум людей в кадре',
  maxAttempts: 'Попыток',
  latitude: 'Широта',
  longitude: 'Долгота',
  radiusMeters: 'Радиус',
  areaPolygon: 'Область на карте',
  imageCaption: 'Плашка над картинкой',
  landingSlot: 'Слот на главной',
  backstory: 'Справка о месте',
  afterword: 'Что рассказать',
  afterwordUrl: 'Ссылка',
  afterwordUrlLabel: 'Подпись ссылки',
};

export const TASK_DIFFICULTY_TEXT: Record<TaskDifficulty, string> = {
  easy: 'Просто',
  medium: 'Средне',
  hard: 'Сложно',
};

export const EVENT_STATUS_TEXT: Record<string, string> = {
  draft: 'Черновик',
  registration: 'Регистрация',
  live: 'Идёт',
  paused: 'Пауза',
  finished: 'Завершён',
  archived: 'В архиве',
};

export const TEAM_STATUS_TEXT: Record<string, string> = {
  pending: 'Ожидает подтверждения',
  confirmed: 'Подтверждена',
  cancelled: 'Отменена',
};

export const LEADERBOARD_MODE_TEXT: Record<string, string> = {
  public: 'Виден всем',
  team_position_only: 'Только своё место',
  hidden: 'Скрыт',
  frozen: 'Заморожен',
};

// ═══ Числительные ══════════════════════════════════════════════

/** «1 задание», «2 задания», «5 заданий». */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function tasksWord(n: number): string {
  return plural(n, 'задание', 'задания', 'заданий');
}

export function pointsWord(n: number): string {
  return plural(n, 'балл', 'балла', 'баллов');
}

export function teamsWord(n: number): string {
  return plural(n, 'команда', 'команды', 'команд');
}

export function attemptsWord(n: number): string {
  return plural(n, 'попытка', 'попытки', 'попыток');
}

export function membersWord(n: number): string {
  return plural(n, 'участник', 'участника', 'участников');
}

export function photosWord(n: number): string {
  return plural(n, 'фотография', 'фотографии', 'фотографий');
}
