'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { registerTeamAction, type ActionState } from '@/actions/team';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, TextInput } from '@/components/ui/field';
import { ErrorNotice } from '@/components/ui/feedback';
import { errorMessage } from '@/lib/messages';

const INITIAL: ActionState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending}>
      {pending ? 'Создаём команду…' : 'Создать команду'}
    </Button>
  );
}

export function RegisterForm({ teamSize }: { teamSize: number }) {
  const [state, formAction] = useActionState(registerTeamAction, INITIAL);
  const fields = state.fields ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {state.error && state.error !== 'validation_failed' && (
        <ErrorNotice>{errorMessage(state.error)}</ErrorNotice>
      )}

      <Field
        label="Название команды"
        htmlFor="teamName"
        required
        error={fields.teamName}
        hint="Его увидят все в рейтинге. До 60 символов."
      >
        <TextInput
          id="teamName"
          name="teamName"
          required
          maxLength={60}
          autoComplete="off"
          enterKeyHint="next"
          invalid={Boolean(fields.teamName)}
          placeholder="Например: Ночной трамвай"
        />
      </Field>

      <Field
        label="Имя капитана"
        htmlFor="captainName"
        required
        error={fields.captainName}
        hint="Как к вам обращаться организатору."
      >
        <TextInput
          id="captainName"
          name="captainName"
          required
          maxLength={60}
          autoComplete="name"
          enterKeyHint="next"
          invalid={Boolean(fields.captainName)}
          placeholder="Имя"
        />
      </Field>

      <Field
        label="Контакт для организатора"
        htmlFor="contact"
        error={fields.contact}
        hint="Telegram, телефон или email. Нужен, чтобы связаться до старта. Не публикуется."
      >
        <TextInput
          id="contact"
          name="contact"
          maxLength={200}
          autoComplete="off"
          enterKeyHint="done"
          invalid={Boolean(fields.contact)}
          placeholder="@username"
        />
      </Field>

      <div className="flex flex-col gap-4 rounded-[16px] border border-hairline bg-paper p-4">
        <Checkbox
          name="acceptRules"
          required
          label={
            <>
              Я принимаю{' '}
              <Link href="/rules" className="underline underline-offset-2">
                правила
              </Link>{' '}
              и{' '}
              <Link href="/terms" className="underline underline-offset-2">
                условия участия
              </Link>
              , а также согласен на обработку загруженных фотографий для проверки заданий
            </>
          }
          description="Без этого согласия участие невозможно."
        />
        {fields.acceptRules && (
          <p className="text-caption text-ink" role="alert">
            <span aria-hidden="true">! </span>
            {fields.acceptRules}
          </p>
        )}

        {/* Публикация в соцсетях — отдельный и необязательный выбор. */}
        <Checkbox
          name="allowSocialPublication"
          label="Разрешаю публиковать наши фотографии в социальных сетях мероприятия"
          description="Необязательно. На участие и начисление баллов никак не влияет."
        />
      </div>

      <SubmitButton />

      <p className="text-caption text-sepia">
        После создания команды вы получите код из шести символов. Передайте его остальным —
        всего в команде может быть до {teamSize} человек, включая вас.
      </p>
    </form>
  );
}
