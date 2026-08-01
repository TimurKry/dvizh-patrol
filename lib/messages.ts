/**
 * Тексты для пользователя. Все — на русском.
 *
 * Коды ошибок приходят из SQL-функций и серверных проверок;
 * здесь они превращаются в человеческие формулировки. Технические
 * подробности («database_error», «ai_invalid_response») наружу
 * не показываем: участник на улице ничего не может с ними сделать.
 */

import type { SubmissionStatus, TaskCategory, TaskDifficulty } from '@/types/database';

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
  already_accepted: 'Это задание уже засчитано вашей команде.',
  attempt_limit_reached: 'Попытки по этому заданию закончились.',
  submission_not_found: 'Отправка не найдена.',
  task_already_accepted: 'По этому заданию уже принята другая фотография.',

  // Файлы
  invalid_file_type: 'Можно загружать только изображения.',
  file_too_large: 'Файл слишком большой. Уменьшите качество и попробуйте снова.',
  file_missing: 'Файл не получен. Попробуйте ещё раз.',
  upload_failed: 'Не удалось загрузить фотографию. Проверьте связь и повторите.',
  storage_object_missing: 'Файл не долетел до сервера. Отправьте фотографию ещё раз.',

  // Геолокация
  location_required: 'Для этого задания нужно разрешить доступ к геопозиции.',
  location_too_far: 'Вы слишком далеко от нужной точки.',
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
  icon: string;
}

export const SUBMISSION_STATUS_TEXT: Record<SubmissionStatus, StatusPresentation> = {
  draft: {
    label: 'Черновик',
    hint: 'Фотография выбрана, но ещё не отправлена.',
    icon: '○',
  },
  uploading: {
    label: 'Загружается',
    hint: 'Идёт загрузка. Не закрывайте страницу.',
    icon: '↑',
  },
  pending: {
    label: 'Ожидает проверки',
    hint: 'Фото загружено и отправлено на проверку. Можно продолжать квест.',
    icon: '•',
  },
  checking: {
    label: 'Проверяется',
    hint: 'Идёт автоматическая проверка.',
    // ◐ отсутствует в наборе плакатного шрифта и выпадал
    // в замену. Двойная стрелка есть везде.
    icon: '»',
  },
  accepted: {
    label: 'Принято',
    hint: 'Задание засчитано, баллы начислены.',
    icon: '✓',
  },
  manual_review: {
    label: 'Ручная проверка',
    hint: 'Фотография ожидает решения организатора.',
    icon: '⁂',
  },
  rejected: {
    label: 'Отклонено',
    hint: 'Организатор не засчитал эту фотографию.',
    icon: '×',
  },
  upload_failed: {
    label: 'Не загрузилось',
    hint: 'Файл не сохранился. Попробуйте отправить снова.',
    icon: '!',
  },
  cancelled: {
    label: 'Отменено',
    hint: 'Отправка отменена организатором.',
    icon: '−',
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
};

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
