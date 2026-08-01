'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Ошибки полей формы — через контекст, а не через render-prop.
 *
 * Раньше `ActionForm` принимал `children` функцией и передавал в
 * неё разбор ошибок. Из серверного компонента так нельзя: функция
 * не сериализуется через границу RSC, и React падает с
 * «Functions are not valid as a child of Client Components».
 *
 * Контекст решает это без компромиссов: серверная страница отдаёт
 * обычную разметку, а `Field` уже внутри клиента достаёт свою
 * ошибку по имени поля.
 */

const FieldErrorsContext = createContext<Record<string, string>>({});

export function FieldErrorsProvider({
  errors,
  children,
}: {
  errors: Record<string, string>;
  children: ReactNode;
}) {
  return <FieldErrorsContext.Provider value={errors}>{children}</FieldErrorsContext.Provider>;
}

/** Ошибка конкретного поля. Вне провайдера — просто undefined. */
export function useFieldError(name?: string): string | undefined {
  const errors = useContext(FieldErrorsContext);
  return name ? errors[name] : undefined;
}
