import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  BadgeCheck,
  CalendarCog,
  Check,
  CircleDashed,
  ClipboardList,
  Clock,
  Eye,
  Hourglass,
  Info,
  Layers,
  LayoutDashboard,
  Loader,
  Map as MapIcon,
  Minus,
  MoreHorizontal,
  Pause,
  ScrollText,
  Settings,
  Snowflake,
  Trophy,
  Upload,
  Users,
  WifiOff,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Значки интерфейса.
 *
 * До этого статусы и разделы обозначались типографскими символами:
 * `◇`, `⁂`, `▦`, `⁋`, `◍`. Идея была в том, чтобы обойтись без
 * иконочного шрифта, но вышло хуже по всем статьям. Такие символы
 * подбираются по принципу «что нашлось в юникоде», а не по смыслу:
 * ромб ничего не говорит про задание, а `⁂` — про ручную проверку.
 * Часть из них к тому же нет в Unbounded, и они молча заменялись
 * начертанием из другого шрифта, ломая строку.
 *
 * Здесь Lucide: один набор, одна сетка 24×24, одна толщина штриха.
 * Импортируются поимённо, поэтому в сборку попадают только
 * использованные — это десятки байт, а не библиотека целиком.
 *
 * Знаки типов заданий живут отдельно, в `game/task-type-icon`:
 * фотоаппарат и бегущие человечки — рисунки владельца, а не
 * готовый набор.
 */

export type IconName =
  // Статусы отправки
  | 'draft'
  | 'uploading'
  | 'pending'
  | 'checking'
  | 'accepted'
  | 'manual-review'
  | 'rejected'
  | 'upload-failed'
  | 'cancelled'
  // Состояния карточки
  | 'available'
  | 'taken'
  | 'exhausted'
  // Разделы админки
  | 'dashboard'
  | 'queue'
  | 'teams'
  | 'tasks'
  | 'leaderboard'
  | 'event'
  | 'import'
  | 'export'
  | 'audit'
  | 'settings'
  // Сообщения и прочее
  | 'info'
  | 'paused'
  | 'frozen'
  | 'offline'
  | 'race'
  | 'remove'
  | 'open'
  | 'more'
  | 'map';

const ICONS: Record<IconName, LucideIcon> = {
  draft: CircleDashed,
  uploading: Upload,
  pending: Clock,
  checking: Loader,
  accepted: Check,
  'manual-review': Eye,
  rejected: X,
  'upload-failed': AlertTriangle,
  cancelled: Minus,

  available: BadgeCheck,
  taken: Check,
  exhausted: Hourglass,

  dashboard: LayoutDashboard,
  queue: ClipboardList,
  teams: Users,
  tasks: Layers,
  leaderboard: Trophy,
  event: CalendarCog,
  import: ArrowDownToLine,
  export: ArrowUpFromLine,
  audit: ScrollText,
  settings: Settings,

  info: Info,
  paused: Pause,
  frozen: Snowflake,
  offline: WifiOff,
  race: Zap,
  remove: X,
  open: ArrowUpRight,
  more: MoreHorizontal,
  map: MapIcon,
};

/** Все имена набора — для витрины дизайн-системы. */
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export function Icon({
  name,
  size = 16,
  strokeWidth = 2,
  className,
}: {
  name: IconName;
  size?: number;
  /** Толщина штриха. Меняется только там, где значок сам несёт
      состояние — например, активный пункт нижней навигации. */
  strokeWidth?: number;
  className?: string;
}) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      className={cn('shrink-0', className)}
      aria-hidden="true"
      focusable="false"
    />
  );
}
