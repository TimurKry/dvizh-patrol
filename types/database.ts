/**
 * Типы базы данных.
 *
 * Пишутся вручную и держатся в соответствии с supabase/migrations.
 * Сгенерировать заново можно так:
 *   npx supabase gen types typescript --project-id <ref> > types/database.generated.ts
 * но ручная версия читаемее и не тянет CLI в сборку.
 */

// ═══ Перечисления ══════════════════════════════════════════════

// Цвет команды описан в lib/team-colors.ts вместе с hex-значениями:
// держать перечисление в двух местах — верный способ их рассинхронить.
import type { TeamColor } from '@/lib/team-colors';

export type { TeamColor };

export const EVENT_STATUSES = [
  'draft',
  'registration',
  'live',
  'paused',
  'finished',
  'archived',
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const TEAM_STATUSES = ['pending', 'confirmed', 'cancelled'] as const;
export type TeamStatus = (typeof TEAM_STATUSES)[number];

export const SUBMISSION_STATUSES = [
  'draft',
  'uploading',
  'pending',
  'checking',
  'accepted',
  'manual_review',
  'rejected',
  'upload_failed',
  'cancelled',
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const VALIDATION_MODES = ['auto', 'ai', 'manual'] as const;
export type ValidationMode = (typeof VALIDATION_MODES)[number];

export const VALIDATION_JOB_STATUSES = [
  'queued',
  'processing',
  'completed',
  'failed',
  'cancelled',
] as const;
export type ValidationJobStatus = (typeof VALIDATION_JOB_STATUSES)[number];

export const LEADERBOARD_MODES = ['public', 'team_position_only', 'hidden', 'frozen'] as const;
export type LeaderboardMode = (typeof LEADERBOARD_MODES)[number];

export const SCORE_TRANSACTION_TYPES = [
  'task_accepted',
  'manual_adjustment',
  'bonus',
  'penalty',
  'submission_revoked',
] as const;
export type ScoreTransactionType = (typeof SCORE_TRANSACTION_TYPES)[number];

export const TASK_CATEGORIES = [
  'monuments',
  'road_signs',
  'advertising',
  'interaction',
  'object_search',
  'team',
  'creative',
  'special',
] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type TaskDifficulty = (typeof TASK_DIFFICULTIES)[number];

/**
 * Тип карточки. Рука команды состоит из двух карточек каждого
 * типа, поэтому это отдельное поле, а не производная от одной из
 * восьми категорий.
 */
export const TASK_CARD_TYPES = ['riddle', 'photo', 'active'] as const;
export type TaskCardType = (typeof TASK_CARD_TYPES)[number];

/**
 * Что задание рисует на карте.
 *
 * Отдельно от типа карточки намеренно. Раньше «загадка» означала
 * круг, а «фото» — крест, и выбора не было: круг у загадки либо
 * настолько мелкий, что выдаёт ответ, либо настолько крупный, что
 * бесполезен. Тип решает состав руки, режим карты — карту.
 */
export const TASK_MAP_MODES = ['none', 'point', 'area'] as const;
export type TaskMapMode = (typeof TASK_MAP_MODES)[number];

/** Почему отправка ушла в ручную проверку. */
export const REVIEW_REASONS = [
  'possible_duplicate',
  'ai_low_confidence',
  'ai_unavailable',
  'ai_invalid_response',
  'ai_error',
  'manual_mode',
  'criterion_failed',
] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

// ═══ Строки таблиц ═════════════════════════════════════════════

export interface EventRow {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  city: string;
  timezone: string;
  starts_at: string;
  ends_at: string | null;
  status: EventStatus;
  price_cents: number;
  currency: string;
  max_teams: number;
  team_size: number;
  registration_open: boolean;
  leaderboard_mode: LeaderboardMode;
  ai_validation_enabled: boolean;
  ai_accept_threshold: number;
  photo_retention_days: number | null;
  poster_path: string | null;
  leaderboard_frozen_at: string | null;
  /**
   * Игровое поле: круг на карте. Три колонки заполняются только
   * вместе — это держит ограничение в базе, — но по отдельности
   * каждая nullable. Собирать их в объект следует через
   * `toPlayArea` из lib/geo, а не проверять руками в каждом месте.
   */
  area_latitude: number | null;
  area_longitude: number | null;
  area_radius_meters: number | null;
  /** Строгий режим: отправка вне поля не принимается. */
  area_enforced: boolean;
  /** Граница поля как GeoJSON Polygon. NULL — используется круг. */
  area_polygon: unknown;
  created_at: string;
  updated_at: string;
}

export interface TeamRow {
  id: string;
  event_id: string;
  name: string;
  join_code: string;
  captain_name: string;
  contact: string | null;
  status: TeamStatus;
  payment_confirmed: boolean;
  /** Ключ цвета. Hex — в lib/team-colors.ts. NULL, если все шесть заняты. */
  color: TeamColor | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMemberRow {
  id: string;
  team_id: string;
  name: string;
  is_captain: boolean;
  created_at: string;
}

export interface TeamSessionRow {
  id: string;
  team_id: string;
  member_id: string | null;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  last_seen_at: string;
  user_agent: string | null;
}

export interface TaskRow {
  id: string;
  event_id: string;
  number: number;
  title: string;
  short_description: string | null;
  description: string;
  points: number;
  category: TaskCategory;
  card_type: TaskCardType;
  difficulty: TaskDifficulty;
  validation_mode: ValidationMode;
  criteria: string[];
  minimum_people: number;
  max_attempts: number;
  require_location: boolean;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number | null;
  /** Что рисуется на карте. Не выводится из card_type: см. 0014. */
  map_mode: TaskMapMode;
  area_polygon: unknown;
  /** Плашка над картинкой карточки. NULL — плашки нет. */
  image_caption: string | null;
  /** Место в витрине лендинга: 1..3, NULL — не показывать. */
  landing_slot: number | null;
  /** Справка, видная сразу: читается по дороге к точке. */
  backstory: string | null;
  /** Показывается только после отправки, подсказкой быть не может. */
  afterword: string | null;
  afterword_url: string | null;
  afterword_url_label: string | null;
  active: boolean;
  sort_order: number;
  available_from: string | null;
  available_until: string | null;
  /** Команда, забравшая задание. NULL — задание ещё в общем пуле. */
  claimed_by_team_id: string | null;
  claimed_submission_id: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Карточка на руке команды.
 *
 * Приходит из `get_team_hand` в camelCase — это ответ функции,
 * а не строка таблицы, поэтому именование отличается от
 * остальных Row-типов намеренно.
 */
export interface HandCard {
  taskId: string;
  number: number;
  title: string;
  shortDescription: string | null;
  description: string;
  cardType: TaskCardType;
  category: TaskCategory;
  difficulty: TaskDifficulty;
  points: number;
  maxAttempts: number;
  minimumPeople: number;
  requireLocation: boolean;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  criteria: string[];
  dealtAt: string;
  attemptsUsed: number;
  lastStatus: SubmissionStatus | null;
}

/** Как картинка ложится в кадр 4:3. */
export const IMAGE_FITS = ['cover', 'contain'] as const;
export type ImageFit = (typeof IMAGE_FITS)[number];

/**
 * Рамка картинки.
 *
 * Кадр карточки — 4:3, а картинки приходят разные. `cover`
 * заполняет кадр и обрезает лишнее, `contain` вписывает целиком с
 * полями. Точка фокуса говорит, что оставить в кадре при обрезке:
 * у вертикального рисунка это обычно верх, иначе из кадра уезжают
 * головы.
 */
export interface ImageFraming {
  fit: ImageFit;
  focusX: number;
  focusY: number;
}

export interface TaskReferenceImageRow {
  id: string;
  task_id: string;
  image_path: string;
  caption: string | null;
  sort_order: number;
  fit: ImageFit;
  focus_x: number;
  focus_y: number;
  created_at: string;
}

export interface SubmissionRow {
  id: string;
  event_id: string;
  team_id: string;
  task_id: string;
  member_id: string | null;
  image_path: string | null;
  preview_path: string | null;
  status: SubmissionStatus;
  attempt_number: number;
  submitted_at: string;
  idempotency_key: string | null;
  bytes: number | null;
  mime_type: string | null;
  latitude: number | null;
  longitude: number | null;
  location_accuracy: number | null;
  perceptual_hash: string | null;
  duplicate_submission_id: string | null;
  duplicate_similarity: number | null;
  ai_confidence: number | null;
  ai_result: AiValidationResult | null;
  review_reason: ReviewReason | string | null;
  awarded_points: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface ValidationJobRow {
  id: string;
  submission_id: string;
  status: ValidationJobStatus;
  attempts: number;
  available_at: string;
  locked_at: string | null;
  locked_by: string | null;
  last_error: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScoreTransactionRow {
  id: string;
  event_id: string;
  team_id: string;
  submission_id: string | null;
  points: number;
  transaction_type: ScoreTransactionType;
  reason: string | null;
  created_by: string | null;
  reverses_transaction_id: string | null;
  reversed_by_transaction_id: string | null;
  created_at: string;
}

export interface ConsentRow {
  id: string;
  team_id: string;
  member_id: string | null;
  member_name: string;
  participation_consent: boolean;
  photo_processing_consent: boolean;
  social_publication_consent: boolean;
  policy_version: string;
  created_at: string;
}

export interface AdminUserRow {
  user_id: string;
  email: string;
  name: string | null;
  created_at: string;
}

export interface AdminAuditLogRow {
  id: string;
  admin_id: string | null;
  admin_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_data: unknown;
  after_data: unknown;
  created_at: string;
}

// ═══ Представления ═════════════════════════════════════════════

export interface LeaderboardRow {
  event_id: string;
  team_id: string;
  team_name: string;
  total_points: number;
  accepted_count: number;
  last_accepted_at: string | null;
  position: number;
  rank: number;
}

export interface LeaderboardSnapshotRow {
  id: string;
  event_id: string;
  position: number;
  team_id: string;
  team_name: string;
  total_points: number;
  accepted_count: number;
  frozen_at: string;
}

export interface TeamProgressRow {
  team_id: string;
  event_id: string;
  tasks_total: number;
  accepted: number;
  pending: number;
  checking: number;
  manual_review: number;
  rejected: number;
  in_review: number;
  tasks_touched: number;
}

export interface AdminDashboardRow {
  event_id: string;
  status: EventStatus;
  registration_open: boolean;
  max_teams: number;
  team_size: number;
  leaderboard_mode: LeaderboardMode;
  ai_validation_enabled: boolean;
  teams_active: number;
  teams_confirmed: number;
  teams_pending: number;
  members_total: number;
  tasks_active: number;
  submissions_total: number;
  submissions_pending: number;
  submissions_checking: number;
  submissions_accepted: number;
  submissions_manual_review: number;
  submissions_rejected: number;
  possible_duplicates: number;
  ai_failed_jobs: number;
  ai_queued_jobs: number;
}

// ═══ Результат AI ══════════════════════════════════════════════

export interface AiCriterionCheck {
  criterion: string;
  passed: boolean;
  confidence: number;
  comment: string;
}

export interface AiValidationResult {
  decision: 'accept' | 'manual_review';
  confidence: number;
  checks: AiCriterionCheck[];
  reason: string;
  /** Служебные поля, дописываются приложением. */
  model?: string;
  durationMs?: number;
  evaluatedAt?: string;
}

// ═══ Ответы функций ════════════════════════════════════════════

export type RpcResult<T> = ({ ok: true } & T) | { ok: false; error: string; [k: string]: unknown };
