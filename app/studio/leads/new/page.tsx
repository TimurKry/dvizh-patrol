import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm } from '@/components/admin/action-form';
import { Card } from '@/components/ui/surface';
import { Field, Select, TextArea, TextInput } from '@/components/ui/field';
import { createLeadAction } from '@/actions/studio';
import { requireAdmin } from '@/lib/auth/admin';
import { PARTICIPANTS_LABEL, SCENARIO_LABEL } from '@/lib/studio/leads';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Новая заявка' };

/**
 * Ручной ввод заявки.
 *
 * Для тех, кто написал напрямую в Telegram или позвонил: бриф
 * с сайта заполняет таблицу сам, а эти разговоры иначе остаются
 * только в переписке. Обязательны имя и способ связи — остальное
 * дозаполняется по ходу разговора заметками.
 */
export default async function StudioNewLeadPage() {
  await requireAdmin();

  return (
    <div className="page-well flex max-w-2xl flex-col gap-6 py-8">
      <header className="flex flex-col gap-3">
        <Link href="/studio/leads" className="text-caption text-muted hover:text-ink">
          ← Все заявки
        </Link>
        <h1 className="text-headline">Новая заявка</h1>
      </header>

      <Card className="p-5">
        <ActionForm
          action={createLeadAction}
          submitLabel="Сохранить"
          className="flex flex-col gap-4"
        >
          <Field label="Откуда" htmlFor="lead-source" name="source">
            <Select id="lead-source" name="source" defaultValue="telegram">
              <option value="telegram">Telegram</option>
              <option value="manual">Другое (звонок, встреча)</option>
            </Select>
          </Field>
          <Field label="Имя или компания" htmlFor="lead-name" name="name" required>
            <TextInput id="lead-name" name="name" required maxLength={120} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Telegram или телефон"
              htmlFor="lead-messenger"
              name="messenger"
              hint="@ник или +49…"
            >
              <TextInput id="lead-messenger" name="messenger" maxLength={120} />
            </Field>
            <Field label="Email" htmlFor="lead-email" name="email">
              <TextInput id="lead-email" name="email" type="email" maxLength={200} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Город" htmlFor="lead-city" name="city">
              <TextInput id="lead-city" name="city" maxLength={120} />
            </Field>
            <Field label="Дата ивента" htmlFor="lead-date" name="eventDate">
              <TextInput id="lead-date" name="eventDate" type="date" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Игра" htmlFor="lead-scenario" name="scenario">
              <Select id="lead-scenario" name="scenario" defaultValue="">
                <option value="">Пока неизвестно</option>
                {Object.entries(SCENARIO_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Участников" htmlFor="lead-participants" name="participantsRange">
              <Select id="lead-participants" name="participantsRange" defaultValue="">
                <option value="">Пока неизвестно</option>
                {Object.entries(PARTICIPANTS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Комментарий" htmlFor="lead-notes" name="notes">
            <TextArea id="lead-notes" name="notes" maxLength={4000} />
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}
