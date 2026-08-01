'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { joinTeamAction, type ActionState } from '@/actions/team';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, TextInput } from '@/components/ui/field';
import { ErrorNotice } from '@/components/ui/feedback';
import { errorMessage } from '@/lib/messages';

const INITIAL: ActionState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending}>
      {pending ? 'Входим…' : 'Войти в команду'}
    </Button>
  );
}

export function JoinForm({ defaultCode }: { defaultCode?: string }) {
  const [state, formAction] = useActionState(joinTeamAction, INITIAL);
  const fields = state.fields ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {state.error && state.error !== 'validation_failed' && (
        <ErrorNotice>{errorMessage(state.error)}</ErrorNotice>
      )}

      <Field
        label="Код команды"
        htmlFor="joinCode"
        required
        error={fields.joinCode}
        hint="Шесть символов от капитана. Регистр не важен."
      >
        <TextInput
          id="joinCode"
          name="joinCode"
          required
          defaultValue={defaultCode}
          maxLength={8}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="next"
          inputMode="text"
          invalid={Boolean(fields.joinCode)}
          placeholder="A1B2C3"
          className="text-center text-heading-sm tracking-[0.3em] uppercase"
        />
      </Field>

      <Field
        label="Ваше имя"
        htmlFor="memberName"
        required
        error={fields.memberName}
        hint="Чтобы капитан видел, кто уже в команде."
      >
        <TextInput
          id="memberName"
          name="memberName"
          required
          maxLength={60}
          autoComplete="name"
          enterKeyHint="done"
          invalid={Boolean(fields.memberName)}
          placeholder="Имя"
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
              и согласен на обработку загруженных фотографий для проверки заданий
            </>
          }
        />
        {fields.acceptRules && (
          <p className="text-caption text-ink" role="alert">
            <span aria-hidden="true">! </span>
            {fields.acceptRules}
          </p>
        )}

        <Checkbox
          name="allowSocialPublication"
          label="Разрешаю публиковать наши фотографии в социальных сетях мероприятия"
          description="Необязательно."
        />
      </div>

      <SubmitButton />
    </form>
  );
}
