import { getTeamSession } from '@/lib/session/team-session';
import { TELEGRAM_MANAGER_URL } from '@/lib/links';
import { NavShell, type NavLink } from './nav-shell';

/**
 * Навигация верхнего уровня.
 *
 * Состав ссылок зависит от того, вошла ли команда. Вошедшая
 * команда живёт в нижней навигации из трёх пунктов, поэтому
 * сверху ей нужен только выход к общим разделам — дублировать
 * «Задания» и «Команда» вторым рядом дизайн-система запрещает.
 *
 * Гость получает три ссылки и один CTA. «Создать команду» ведёт
 * в Telegram менеджера, а не на форму: команды заводятся вручную
 * (CLAUDE.md, «Неподвижные продуктовые решения»).
 */
export async function SiteNav() {
  const session = await getTeamSession();

  if (session) {
    const links: NavLink[] = [
      { href: '/tasks', label: 'Задания' },
      { href: '/team', label: 'Команда' },
      { href: '/more', label: 'Ещё' },
    ];
    return <NavShell links={links} action={null} />;
  }

  const links: NavLink[] = [
    { href: '/rules', label: 'Правила' },
    { href: '/leaderboard', label: 'Рейтинг' },
    { href: '/join', label: 'Войти по коду' },
  ];

  return (
    <NavShell
      links={links}
      action={{ href: TELEGRAM_MANAGER_URL, label: 'Создать команду', external: true }}
    />
  );
}
