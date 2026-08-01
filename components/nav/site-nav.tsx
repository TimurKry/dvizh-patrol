import { getTeamSession } from '@/lib/session/team-session';
import { NavShell, type NavLink } from './nav-shell';

/**
 * Навигация верхнего уровня.
 *
 * Состав ссылок зависит от того, вошла ли команда: гостю не за чем
 * показывать «Отправки», а вошедшей команде — кнопку регистрации.
 */
export async function SiteNav() {
  const session = await getTeamSession();

  if (session) {
    const links: NavLink[] = [
      { href: '/tasks', label: 'Задания' },
      { href: '/team', label: 'Команда' },
      { href: '/submissions', label: 'Отправки' },
      { href: '/leaderboard', label: 'Рейтинг' },
    ];
    return <NavShell links={links} action={null} />;
  }

  const links: NavLink[] = [
    { href: '/rules', label: 'Правила' },
    { href: '/leaderboard', label: 'Рейтинг' },
    { href: '/join', label: 'Войти по коду' },
  ];

  return <NavShell links={links} action={{ href: '/register', label: 'Создать команду' }} />;
}
