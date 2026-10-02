'use client';

import { useState, type ChangeEvent } from 'react';

/**
 * Значения формы, которые переживают отказ сервера.
 *
 * React 19 сбрасывает форму после серверного действия — все
 * неуправляемые поля возвращаются к `defaultValue`. Пока действие
 * заканчивается успехом, это незаметно: страница всё равно
 * перерисовывается новыми данными. А вот при отказе всё введённое
 * исчезает на глазах, и выглядит это как «нажал сохранить, и данные
 * просто удалились» — ровно так организатор и описал.
 *
 * Лечится тем, что поля становятся управляемыми: значение живёт в
 * состоянии страницы, а не в DOM, и сбрасывать его нечему.
 *
 * Хук маленький намеренно. Форм в админке четыре, все разной формы,
 * и общая библиотека здесь была бы дороже пользы: нужно ровно две
 * вещи — строки и галочки.
 */

export type FormValue = string | boolean;

export interface FormValues<T extends Record<string, FormValue>> {
  values: T;
  /** Поставить значение снаружи: карта, выбор точки, кнопка «очистить». */
  set: <K extends keyof T>(name: K, value: T[K]) => void;
  /** Свойства для `<input>`, `<textarea>` и `<select>`. */
  field: (name: KeysOf<T, string>) => {
    id: string;
    name: string;
    value: string;
    onChange: (
      event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
    ) => void;
  };
  /** Свойства для галочки. */
  flag: (name: KeysOf<T, boolean>) => {
    name: string;
    checked: boolean;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  };
}

/** Только те ключи, значение которых нужного типа. */
type KeysOf<T, V> = Extract<{ [K in keyof T]: T[K] extends V ? K : never }[keyof T], string>;

export function useFormValues<T extends Record<string, FormValue>>(initial: T): FormValues<T> {
  const [values, setValues] = useState<T>(initial);

  const set = <K extends keyof T>(name: K, value: T[K]) =>
    setValues((current) => ({ ...current, [name]: value }));

  return {
    values,
    set,

    // `id` совпадает с `name`: у полей админки так и есть, а
    // подпись через `htmlFor` иначе пришлось бы дублировать в
    // каждом вызове.
    field: (name) => ({
      id: name,
      name,
      value: String(values[name] ?? ''),
      onChange: (event) => set(name as keyof T, event.target.value as T[keyof T]),
    }),

    flag: (name) => ({
      name,
      checked: Boolean(values[name]),
      onChange: (event) => set(name as keyof T, event.target.checked as T[keyof T]),
    }),
  };
}
