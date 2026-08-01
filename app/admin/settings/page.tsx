import type { Metadata } from 'next';
import { ActionButton } from '@/components/admin/action-form';
import { purgePhotosAction } from '@/actions/admin';
import { Card, Eyebrow } from '@/components/ui/surface';
import { EmptyState, Notice } from '@/components/ui/feedback';
import { Tag } from '@/components/ui/status-badge';
import { requireAdmin } from '@/lib/auth/admin';
import { env, isAiConfigured } from '@/lib/env';
import { getCurrentEvent } from '@/lib/data/event';
import { retentionCutoff } from '@/lib/retention';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Настройки' };

export default async function AdminSettingsPage() {
  const admin = await requireAdmin();
  const event = await getCurrentEvent();
  const config = env();

  if (!event) {
    return (
      <div className="page-well py-10">
        <EmptyState title="Мероприятие не найдено" />
      </div>
    );
  }

  const db = supabaseAdmin();
  const retention = event.photo_retention_days ?? config.PHOTO_RETENTION_DAYS;
  const cutoff = retentionCutoff(retention);

  const [{ count: expiring }, { count: withFiles }] = await Promise.all([
    db
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .lt('submitted_at', cutoff)
      .not('image_path', 'is', null),
    db
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .not('image_path', 'is', null),
  ]);

  return (
    <div className="page-well flex max-w-3xl flex-col gap-6 py-8">
      <header>
        <Eyebrow>Система</Eyebrow>
        <h1 className="mt-2 text-heading">Настройки</h1>
      </header>

      {/* ═══ Состояние ══════════════════════════════════════ */}
      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-subheading">Конфигурация</h2>

        <dl className="grid gap-3 sm:grid-cols-2">
          {[
            ['Администратор', admin.email],
            [
              'Автоматическая проверка',
              isAiConfigured()
                ? `включена, ${config.GEMINI_MODEL}`
                : 'ключ не задан — всё вручную',
            ],
            ['Порог принятия', String(event.ai_accept_threshold)],
            ['Одновременных проверок', String(config.AI_MAX_CONCURRENCY)],
            ['Таймаут проверки', `${config.AI_REQUEST_TIMEOUT_MS / 1000} с`],
            ['Зависшей считается через', `${config.AI_STALE_CHECK_MINUTES} мин`],
            ['Время жизни сессии команды', `${config.TEAM_SESSION_TTL_HOURS} ч`],
            ['Максимальный размер файла', `${config.MAX_UPLOAD_SIZE_MB} МБ`],
            ['Длинная сторона фото', `${config.MAX_IMAGE_LONG_EDGE} px`],
            ['Срок жизни ссылки', `${config.SIGNED_URL_TTL_SECONDS / 60} мин`],
            ['Версия политики', config.POLICY_VERSION],
          ].map(([term, value]) => (
            <div key={term} className="flex flex-col">
              <dt className="text-caption text-stone">{term}</dt>
              <dd className="text-body">{value}</dd>
            </div>
          ))}
        </dl>

        <p className="text-caption text-stone">
          Эти значения задаются переменными окружения и меняются при развёртывании, а не из
          интерфейса. Настройки самого мероприятия — в разделе «Мероприятие».
        </p>
      </Card>

      {/* ═══ Хранение фотографий ════════════════════════════ */}
      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-subheading">Хранение фотографий</h2>

        <div className="flex flex-wrap gap-2">
          <Tag>срок хранения {retention} дней</Tag>
          <Tag>файлов сейчас: {withFiles ?? 0}</Tag>
          <Tag emphasis={(expiring ?? 0) > 0}>просрочено: {expiring ?? 0}</Tag>
        </div>

        <p className="text-body text-stone">
          Удаление стирает файлы из хранилища, но оставляет записи об отправках: журнал
          начислений и итоговый рейтинг не должны разъезжаться из-за уборки файлов.
        </p>

        <ActionButton
          action={purgePhotosAction}
          values={{ eventId: event.id }}
          variant="danger"
          disabled={(expiring ?? 0) === 0}
          confirm={`Удалить ${expiring ?? 0} фотографий старше ${retention} дней? Отменить будет нельзя.`}
        >
          Удалить просроченные фотографии
        </ActionButton>

        <Notice icon="•">
          Срок хранения указан на странице конфиденциальности и виден участникам. Меняется он
          в настройках мероприятия.
        </Notice>
      </Card>

      {/* ═══ Резервный сценарий ═════════════════════════════ */}
      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-subheading">Если что-то пошло не так</h2>
        <ul className="flex flex-col gap-2 text-body text-stone">
          <li>
            <strong>Отказала автоматическая проверка.</strong> Выключите её в настройках
            мероприятия — все фотографии пойдут к вам. Квест не останавливается.
          </li>
          <li>
            <strong>Отправки зависли в «Проверяется».</strong> Кнопка «Обработать зависшие» на
            сводке вернёт их в очередь. Повторная обработка не начисляет баллы дважды.
          </li>
          <li>
            <strong>Нужно срочно разобрать очередь.</strong> «Всё — в ручную проверку» на
            странице проверки переведёт ожидающие отправки к вам.
          </li>
          <li>
            <strong>Команда потеряла доступ.</strong> Сбросьте её сессии и выдайте новый код на
            странице команды.
          </li>
          <li>
            <strong>Ошиблись с решением.</strong> Отклонение принятой отправки снимает баллы
            обратной транзакцией — история сохраняется.
          </li>
        </ul>
        <p className="text-caption text-stone">
          Подробный план — в <code>docs/INCIDENT_PLAN.md</code>.
        </p>
      </Card>
    </div>
  );
}
