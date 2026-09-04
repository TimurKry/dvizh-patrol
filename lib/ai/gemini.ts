import 'server-only';
import { z } from 'zod';
import { env } from '@/lib/env';
import type { AiValidationResult } from '@/types/database';

/**
 * Проверка фотографии через Gemini.
 *
 * Границы, которые здесь заданы намеренно и не должны сдвигаться:
 *
 *  · модель может ПРИНЯТЬ или ОТПРАВИТЬ К ЧЕЛОВЕКУ — отклонить
 *    окончательно она не может никогда;
 *  · любой невалидный ответ, таймаут или сбой сети — это
 *    manual_review, а не отказ участнику;
 *  · в запрос не уходят имена участников, название команды и
 *    контакты: модели незачем знать, кто на фотографии;
 *  · модели прямо запрещено опознавать людей и рассуждать о
 *    чувствительных характеристиках.
 *
 * Ключ используется только на сервере. Обращение идёт напрямую
 * к REST API, без SDK: одна функция дешевле лишней зависимости.
 */

// ═══ Схема ответа ══════════════════════════════════════════════

const checkSchema = z.object({
  criterion: z.string().max(400),
  passed: z.boolean(),
  confidence: z.number().min(0).max(1),
  comment: z.string().max(600).default(''),
});

const responseSchema = z.object({
  decision: z.enum(['accept', 'manual_review']),
  confidence: z.number().min(0).max(1),
  checks: z.array(checkSchema).max(20).default([]),
  reason: z.string().max(1000),
});

// ═══ Промпт ════════════════════════════════════════════════════

const SYSTEM_RULES = `Ты — помощник судьи городского фото-квеста.

Тебе показывают фотографию, сделанную командой участников, и условия задания.
Твоя единственная задача — определить, соответствует ли фотография условиям.

СТРОГО ЗАПРЕЩЕНО:
- опознавать людей, сравнивать лица, называть или предполагать имена;
- определять возраст, пол, национальность, происхождение, вероисповедание;
- делать выводы о здоровье, состоянии или эмоциях людей;
- оценивать внешность, красоту, одежду и телосложение;
- рассуждать о любых чувствительных характеристиках людей в кадре.

Людей описывай обезличенно: «человек», «участник», «двое людей».

ТЫ НЕ ОЦЕНИВАЕШЬ художественное качество, композицию и оригинальность.
Проверяй только фактическое соответствие условиям.

РЕШЕНИЕ:
- "accept" — на фотографии видно то, чего требует задание;
- "manual_review" — требуемого не видно вовсе, либо кадр не разобрать.

СУДИ ДОБРОЖЕЛАТЕЛЬНО. Это игра, а не экзамен. Команды снимают на телефон
на ходу, они заинтересованы играть честно и обманывать тебя не пытаются.

Не требуй идеального ракурса, общего плана, хорошего света, полностью
попавшего в кадр окружения. Крупный план, срезанные края, случайные
прохожие, наклон, тень, ночь — не причины для сомнений. Если требуемое
на фотографии есть, засчитывай.

Сомнение вида «а точно ли это то самое здание» или «а вдруг это не то»
решай в пользу команды. Отправляй к человеку только тогда, когда
требуемого на фотографии действительно нет.

Отклонять задание ты не можешь.

Поле reason заполняй кратко и по-русски: одно-два предложения.`;

function buildPrompt(task: {
  title: string;
  description: string;
  criteria: string[];
  hiddenCriteria?: string[];
  minimumPeople: number;
}): string {
  // Открытые и скрытые критерии для судьи равнозначны: он проверяет
  // и те, и другие. Разница только в том, что скрытые не видит
  // команда, — у загадки открытый критерий назвал бы ответ.
  const all = [...task.criteria, ...(task.hiddenCriteria ?? [])];

  const criteria =
    all.length > 0
      ? all.map((c, i) => `${i + 1}. ${c}`).join('\n')
      : 'Отдельных критериев нет — оценивай по описанию задания.';

  const people =
    task.minimumPeople > 0
      ? `\nВ кадре должно быть видно минимум ${task.minimumPeople} человек(а). ` +
        'Считай людей обезличенно, не описывая их.'
      : '';

  return `ЗАДАНИЕ: ${task.title}

ОПИСАНИЕ:
${task.description}

КРИТЕРИИ ПРОВЕРКИ:
${criteria}${people}

Проверь каждый критерий по фотографии и верни результат.`;
}

/** Тот же промпт для теста: собирать его заново в тесте — значит
    проверять копию, а не то, что уходит к модели. */
export const buildPromptForTests = buildPrompt;

/** Системная инструкция для теста. Запреты в ней — не стиль, а
    обещание со страницы конфиденциальности, и правка тона судьи
    не должна их задеть. */
export const SYSTEM_RULES_FOR_TESTS = SYSTEM_RULES;

// ═══ Форма запроса ═════════════════════════════════════════════

/**
 * Настройки генерации и безопасности вынесены из `validatePhoto`
 * не ради красоты: «проверить связь» шлёт ровно ту же форму
 * запроса. Иначе кнопка отвечала бы за один запрос, а квест
 * падал бы на другом.
 */
const GENERATION_CONFIG = {
  temperature: 0.1,
  // Gemini 3 размышляет перед ответом, и по умолчанию — подолгу:
  // на 2.5 запрос укладывался в секунды, на 3.6 упирался в таймаут
  // и уходил в ручную проверку. Здесь размышлять особо не над чем:
  // критерии сформулированы явно, модель сверяет их с фотографией.
  // Совсем выключить размышление в третьем поколении нельзя, но
  // `low` возвращает время ответа к прежнему порядку.
  thinkingConfig: { thinkingLevel: 'low' },
  // Структурированный вывод: модель обязана вернуть JSON
  // нужной формы, а не текст с описанием JSON.
  responseMimeType: 'application/json',
  responseSchema: {
    type: 'OBJECT',
    properties: {
      decision: { type: 'STRING', enum: ['accept', 'manual_review'] },
      confidence: { type: 'NUMBER' },
      checks: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            criterion: { type: 'STRING' },
            passed: { type: 'BOOLEAN' },
            confidence: { type: 'NUMBER' },
            comment: { type: 'STRING' },
          },
          required: ['criterion', 'passed', 'confidence'],
        },
      },
      reason: { type: 'STRING' },
    },
    required: ['decision', 'confidence', 'reason'],
  },
} as const;

const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
] as const;

function endpoint(model: string): string {
  return (
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent`
  );
}

// ═══ Вызов ═════════════════════════════════════════════════════

export type AiOutcome =
  | { status: 'ok'; result: AiValidationResult }
  | { status: 'invalid'; raw: string }
  | { status: 'error'; error: string; retryable: boolean }
  | { status: 'disabled' };

export interface ValidateParams {
  imageBase64: string;
  mimeType: string;
  task: {
    title: string;
    description: string;
    criteria: string[];
    hiddenCriteria?: string[];
    minimumPeople: number;
  };
  referenceBase64?: string | null;
  referenceMimeType?: string | null;
}

export async function validatePhoto(params: ValidateParams): Promise<AiOutcome> {
  const config = env();
  const apiKey = config.GEMINI_API_KEY;

  if (!apiKey || !config.AI_VALIDATION_ENABLED) {
    return { status: 'disabled' };
  }

  const parts: Array<Record<string, unknown>> = [{ text: buildPrompt(params.task) }];

  // Эталон идёт первым и подписан, иначе модель путает, какая
  // фотография чья.
  if (params.referenceBase64) {
    parts.push({ text: 'ЭТАЛОННОЕ ИЗОБРАЖЕНИЕ (пример от организатора):' });
    parts.push({
      inline_data: {
        mime_type: params.referenceMimeType ?? 'image/jpeg',
        data: params.referenceBase64,
      },
    });
  }

  parts.push({ text: 'ФОТОГРАФИЯ КОМАНДЫ (её и нужно проверить):' });
  parts.push({
    inline_data: { mime_type: params.mimeType, data: params.imageBase64 },
  });

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_RULES }] },
    contents: [{ role: 'user', parts }],
    generationConfig: GENERATION_CONFIG,
    safetySettings: SAFETY_SETTINGS,
  };

  const url = endpoint(config.GEMINI_MODEL);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.AI_REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      // 429 и 5xx имеет смысл повторить, 4xx — нет.
      const retryable = response.status === 429 || response.status >= 500;
      return {
        status: 'error',
        error: `HTTP ${response.status}: ${geminiErrorText(text)}`,
        retryable,
      };
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
    };

    const candidate = payload.candidates?.[0];
    const raw = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';

    if (!raw.trim()) {
      // Сработал фильтр безопасности или модель промолчала —
      // отдаём человеку, не отклоняя.
      return { status: 'invalid', raw: candidate?.finishReason ?? 'empty_response' };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return { status: 'invalid', raw: raw.slice(0, 500) };
    }

    const parsed = responseSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return { status: 'invalid', raw: raw.slice(0, 500) };
    }

    return {
      status: 'ok',
      result: {
        ...parsed.data,
        model: config.GEMINI_MODEL,
        durationMs: Date.now() - startedAt,
        evaluatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      status: 'error',
      // Срок называется прямо: «timeout» без числа не даёт понять,
      // модель отвечает медленно или мы её ждём слишком мало.
      error: aborted
        ? `timeout (${Math.round(config.AI_REQUEST_TIMEOUT_MS / 1000)} с)`
        : String(error).slice(0, 300),
      retryable: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ═══ Проверка связи ════════════════════════════════════════════

/** Прозрачный пиксель: минимальная картинка, чтобы проверить и
    путь с inline_data, а не только текстовый запрос. */
const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk' +
  'YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** Какой из двух запросов не прошёл. */
export type PingStage = 'key' | 'request';

export type PingResult =
  | { status: 'ok'; model: string; durationMs: number }
  | { status: 'disabled' }
  | { status: 'http'; stage: PingStage; code: number; detail: string }
  | { status: 'network'; stage: PingStage; detail: string };

/**
 * Проверка связи с моделью — по кнопке в админке.
 *
 * Нужна затем, что до квеста ключ проверить больше нечем: без неё
 * первым сигналом о неверном ключе становится фотография команды,
 * ушедшая на ручную проверку.
 *
 * Запросов два, и это главное. Первый — голый: текст и один
 * пиксель. Второй — ровно та форма, что уходит при проверке
 * фотографии: системная инструкция, схема ответа, настройки
 * безопасности. Поэтому отказ сразу разделяется на «ключ не
 * принят» и «ключ рабочий, но модель отвергла сам запрос», а это
 * два совершенно разных исправления.
 */
export async function pingGemini(): Promise<PingResult> {
  const config = env();
  const apiKey = config.GEMINI_API_KEY;

  if (!apiKey || !config.AI_VALIDATION_ENABLED) {
    return { status: 'disabled' };
  }

  const image = { inline_data: { mime_type: 'image/png', data: ONE_PIXEL_PNG } };
  const startedAt = Date.now();

  // ─── Ключ ─────────────────────────────────────────────────
  const plain = await probe(apiKey, config.GEMINI_MODEL, config.AI_REQUEST_TIMEOUT_MS, 'key', {
    contents: [{ role: 'user', parts: [{ text: 'Ответь одним словом: ok' }, image] }],
    // Размышление считается в тот же лимит, поэтому «16 токенов»
    // на думающей модели означало бы обрыв ещё до ответа.
    generationConfig: {
      temperature: 0,
      thinkingConfig: { thinkingLevel: 'low' },
      maxOutputTokens: 512,
    },
  });
  if (plain) return plain;

  // ─── Форма боевого запроса ────────────────────────────────
  const shaped = await probe(apiKey, config.GEMINI_MODEL, config.AI_REQUEST_TIMEOUT_MS, 'request', {
    system_instruction: { parts: [{ text: SYSTEM_RULES }] },
    contents: [
      { role: 'user', parts: [{ text: 'Проверочный запрос. Верни manual_review.' }, image] },
    ],
    generationConfig: GENERATION_CONFIG,
    safetySettings: SAFETY_SETTINGS,
  });
  if (shaped) return shaped;

  return { status: 'ok', model: config.GEMINI_MODEL, durationMs: Date.now() - startedAt };
}

/** Один запрос. `null` — прошёл; иначе готовая причина отказа. */
async function probe(
  apiKey: string,
  model: string,
  timeoutMs: number,
  stage: PingStage,
  body: unknown,
): Promise<PingResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint(model), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { status: 'http', stage, code: response.status, detail: geminiErrorText(text) };
    }

    await response.json().catch(() => null);
    return null;
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return { status: 'network', stage, detail: aborted ? 'таймаут' : String(error).slice(0, 200) };
  } finally {
    clearTimeout(timeout);
  }
}

/** Из ответа Google вытаскиваем человеческую строку, а не весь JSON. */
export function geminiErrorText(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; status?: string } };
    const message = parsed.error?.message;
    if (message) return message.slice(0, 300);
    const status = parsed.error?.status;
    if (status) return status;
  } catch {
    /* тело не JSON — отдаём как есть */
  }
  return body.slice(0, 300) || 'пустой ответ';
}

// ═══ Решение по результату ═════════════════════════════════════

export type Verdict =
  | { action: 'accept'; confidence: number }
  | { action: 'manual_review'; reason: string; confidence: number | null };

/**
 * Превращает ответ модели в решение.
 *
 * Порог уверенности берётся из настроек мероприятия, а не из
 * переменных окружения: организатор может поднять или опустить
 * его прямо во время квеста, если видит, что проверка ошибается.
 */
export function decide(result: AiValidationResult, threshold: number): Verdict {
  if (result.decision !== 'accept') {
    return { action: 'manual_review', reason: 'ai_low_confidence', confidence: result.confidence };
  }

  if (result.confidence < threshold) {
    return { action: 'manual_review', reason: 'ai_low_confidence', confidence: result.confidence };
  }

  // Модель сказала «принять», но какой-то критерий не выполнен —
  // противоречие разрешаем в пользу человека.
  const failed = result.checks.find((check) => !check.passed);
  if (failed) {
    return { action: 'manual_review', reason: 'criterion_failed', confidence: result.confidence };
  }

  return { action: 'accept', confidence: result.confidence };
}
