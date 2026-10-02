import type { StaffRole } from '@/types/database';

/**
 * Роли сотрудников и что кому доступно.
 *
 * Чистые функции без обращения к базе: их используют и проверки
 * на сервере, и навигация, а расходиться они не должны.
 */

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  owner: 'Владелец',
  manager: 'Менеджер',
  host: 'Ведущий',
};

export const STAFF_ROLE_HINT: Record<StaffRole, string> = {
  owner: 'Всё, включая состав команды',
  manager: 'Заявки, проекты и игра',
  host: 'Только игра: проверка фото, команды, рейтинг',
};

/** Заявки и (дальше) проекты. */
export const CRM_ROLES: readonly StaffRole[] = ['owner', 'manager'];

export function canUseCrm(role: StaffRole): boolean {
  return CRM_ROLES.includes(role);
}

export function canManageTeam(role: StaffRole): boolean {
  return role === 'owner';
}

/** Куда вести сотрудника после входа и при попытке открыть чужой раздел. */
export function staffHome(role: StaffRole): string {
  return canUseCrm(role) ? '/studio' : '/admin';
}

/**
 * Куда вернуть после входа по ссылке.
 *
 * Принимается только путь внутри приложения: иначе ссылку для
 * входа можно было бы подделать так, чтобы после неё человека
 * увезло на чужой сайт.
 */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return fallback;
  }
  return next;
}
