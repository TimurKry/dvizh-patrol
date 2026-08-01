#!/usr/bin/env node
/**
 * Создание администратора.
 *
 *   node scripts/create-admin.mjs you@example.com "надёжный-пароль"
 *
 * Скрипт делает две вещи: заводит пользователя в Supabase Auth
 * (или находит существующего) и добавляет строку в admin_users.
 * Без второго шага вход не даст никаких прав — роль проверяется
 * именно по таблице, а не по метаданным токена.
 *
 * Запускать локально: скрипту нужен SUPABASE_SERVICE_ROLE_KEY,
 * который никогда не должен попадать в браузер.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

// .env.local читаем сами: тянуть dotenv ради одного скрипта незачем.
function loadEnvFile(path) {
  try {
    const content = readFileSync(path, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // Файла нет — значит, переменные заданы иначе.
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Не заданы NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Заполните .env.local — образец в .env.example.');
  process.exit(1);
}

const email = process.argv[2] ?? process.env.ADMIN_EMAIL;
let password = process.argv[3];

if (!email) {
  console.error('Использование: node scripts/create-admin.mjs <email> [пароль]');
  process.exit(1);
}

// Пароль можно не задавать — тогда он сгенерируется и покажется один раз.
let generated = false;
if (!password) {
  password = randomBytes(12).toString('base64url');
  generated = true;
}

if (password.length < 8) {
  console.error('Пароль должен быть не короче восьми символов.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(target) {
  // В admin API нет поиска по email, поэтому листаем страницы.
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const found = data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  console.log(`→ Проект: ${url}`);
  console.log(`→ Email:  ${email}`);

  let user = await findUserByEmail(email);

  if (user) {
    console.log('→ Пользователь уже существует, обновляем пароль.');
    const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
    if (error) throw new Error(`Не удалось обновить пароль: ${error.message}`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`Не удалось создать пользователя: ${error.message}`);
    user = data.user;
    console.log('→ Пользователь создан.');
  }

  const { error: adminError } = await supabase
    .from('admin_users')
    .upsert({ user_id: user.id, email }, { onConflict: 'user_id' });

  if (adminError) {
    throw new Error(
      `Пользователь есть, но права не выданы: ${adminError.message}\n` +
        'Убедитесь, что миграции применены и таблица admin_users существует.',
    );
  }

  console.log('→ Права администратора выданы.');
  console.log('');
  console.log('Вход: /admin/login');
  console.log(`Email: ${email}`);
  if (generated) {
    console.log(`Пароль: ${password}`);
    console.log('');
    console.log('Пароль показан один раз — сохраните его сейчас.');
  }
}

main().catch((error) => {
  console.error(`\nОшибка: ${error.message}`);
  process.exit(1);
});
