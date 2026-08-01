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
- "accept" — все обязательные условия видны на фотографии и сомнений нет;
- "manual_review" — что-то не видно, кадр неоднозначен, качество не позволяет
  судить, или ты не уверен.

Отклонять задание ты не можешь. Если сомневаешься — "manual_review".
Лучше отправить человеку, чем ошибиться.

Поле reason заполняй кратко и по-русски: одно-два предложения.`;

function buildPrompt(task: {
  title: string;
  description: string;
  criteria: string[];
  minimumPeople: number;
}): string {
  const criteria =
    task.criteria.length > 0
      ? task.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')
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
    generationConfig: {
      temperature: 0.1,
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
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(config.GEMINI_MODEL)}:generateContent`;

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
        error: `HTTP ${response.status}: ${text.slice(0, 300)}`,
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
      error: aborted ? 'timeout' : String(error).slice(0, 300),
      retryable: true,
    };
  } finally {
    clearTimeout(timeout);
  }
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
