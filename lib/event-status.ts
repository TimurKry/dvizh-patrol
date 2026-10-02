import type { EventStatus } from '@/types/database';

/**
 * Граф статусов мероприятия — один на всех.
 *
 * Раньше он существовал в трёх местах: разрешения в серверном
 * действии, кнопки на странице мероприятия и короткий список на
 * сводке. Три копии разошлись молча, и обнаружилось это худшим
 * способом — за день до набора людей. Квест обкатали до конца,
 * статус остался «Завершён», а из «Завершён» вели только
 * «Возобновить» и «В архив»: дороги обратно к набору не было
 * вовсе, и открыть регистрацию стало нечем.
 *
 * Поэтому здесь и переходы, и подписи, и предупреждения. Сервер
 * берёт отсюда список разрешённого, страницы — кнопки. Разойтись
 * им больше негде.
 *
 * Необратим только архив. Всё остальное должно иметь дорогу назад:
 * организатор ошибается кнопкой ровно так же, как все, и цена
 * ошибки не должна быть «заводите мероприятие заново».
 */

export interface EventTransition {
  status: EventStatus;
  label: string;
  /** Вопрос перед действием. Без него кнопка срабатывает сразу. */
  confirm?: string;
  /**
   * Показывать в шапке сводки.
   *
   * Там место только под очевидный следующий шаг: сводка — это
   * «что происходит», а не пульт управления. Полный набор живёт
   * на странице мероприятия.
   */
  onDashboard?: boolean;
}

export const EVENT_TRANSITIONS: Record<EventStatus, EventTransition[]> = {
  draft: [{ status: 'registration', label: 'Открыть регистрацию', onDashboard: true }],

  registration: [
    {
      status: 'live',
      label: 'Запустить квест',
      confirm:
        'Запустить квест? Задания станут видны всем командам, раздача рук начнётся, набор закроется.',
      onDashboard: true,
    },
    {
      status: 'draft',
      label: 'Вернуть в черновик',
      confirm:
        'Вернуть в черновик? Набор закроется, лендинг перестанет звать регистрироваться. Уже зарегистрированные команды останутся.',
    },
  ],

  live: [
    {
      status: 'paused',
      label: 'Приостановить',
      confirm: 'Приостановить квест? Карточки останутся видны, но отправки перестанут приниматься.',
      onDashboard: true,
    },
    {
      status: 'finished',
      label: 'Завершить',
      confirm: 'Завершить квест? Новые отправки будут заблокированы.',
      onDashboard: true,
    },
  ],

  paused: [
    { status: 'live', label: 'Продолжить', onDashboard: true },
    {
      status: 'finished',
      label: 'Завершить',
      confirm: 'Завершить квест? Новые отправки будут заблокированы.',
      onDashboard: true,
    },
  ],

  finished: [
    {
      status: 'live',
      label: 'Возобновить',
      confirm: 'Возобновить квест? Отправки снова начнут приниматься.',
    },
    // Дорога назад к набору. Обкатка заканчивается завершённым
    // квестом, а собирать людей нужно на настоящее мероприятие —
    // без этого перехода статус становится тупиком.
    {
      status: 'draft',
      label: 'Вернуть в черновик',
      confirm:
        'Вернуть в черновик? Задания и результаты закроются у команд, зато мероприятие можно будет заново открыть на набор. Команды, отправки и баллы останутся в базе — их удаляют отдельно.',
      onDashboard: true,
    },
    {
      status: 'archived',
      label: 'В архив',
      confirm: 'Отправить в архив? Вернуть событие обратно будет нельзя.',
    },
  ],

  archived: [],
};

/**
 * Часы игры.
 *
 * Квест заканчивается двумя способами: истекло время или
 * организатор нажал «Завершить». Первого раньше не было вовсе —
 * колонка `ends_at` лежала в схеме с самого начала и не
 * использовалась нигде.
 *
 * Статус временем не меняется: автоматически переключить его
 * некому — на бесплатном тарифе Vercel регулярные задания
 * запускаются раз в сутки. Поэтому срок закрывает окно отправок, а
 * «Завершить» остаётся кнопкой. Так даже честнее: организатор
 * завершает квест, когда все дошли, а не когда истекла минута.
 *
 * Настоящая проверка стоит в `create_submission_slot`. Здесь —
 * чтобы интерфейс не предлагал того, в чём сервер откажет.
 */
export interface GameClock {
  status: EventStatus;
  ends_at: string | null;
}

/** Срок вышел? Пустое время конца означает «срока нет». */
export function deadlinePassed(event: GameClock, now: Date = new Date()): boolean {
  return event.ends_at !== null && now.getTime() > new Date(event.ends_at).getTime();
}

/** Принимаются ли фотографии прямо сейчас. */
export function submissionsOpen(event: GameClock, now: Date = new Date()): boolean {
  return event.status === 'live' && !deadlinePassed(event, now);
}

/**
 * Игра позади: пора к месту сбора.
 *
 * До старта квест не «закончился», а ещё не начинался, — поэтому
 * черновик и набор сюда не попадают.
 */
export function questOver(event: GameClock, now: Date = new Date()): boolean {
  if (event.status === 'finished' || event.status === 'archived') return true;
  return (event.status === 'live' || event.status === 'paused') && deadlinePassed(event, now);
}

/** Что разрешено серверу. Проверка прав — не дело разметки. */
export function allowedNextStatuses(from: EventStatus): EventStatus[] {
  return EVENT_TRANSITIONS[from].map((transition) => transition.status);
}

/** Короткий список для шапки сводки. */
export function dashboardTransitions(from: EventStatus): EventTransition[] {
  return EVENT_TRANSITIONS[from].filter((transition) => transition.onDashboard);
}
