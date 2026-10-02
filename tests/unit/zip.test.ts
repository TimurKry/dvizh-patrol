import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildZip, crc32, safeFileName } from '@/lib/export/zip';

/**
 * Упаковщик ZIP.
 *
 * Своя реализация формата проверяется не своим же кодом, а
 * системным `unzip`: разойдись мы с форматом на один байт, тест,
 * написанный по тем же представлениям, этого не заметит, а
 * организатор получит архив, который «не открывается».
 *
 * Отдельно проверяется кириллица в именах. Это самая частая
 * поломка ZIP: без флага UTF-8 распаковщик читает имя в местной
 * кодировке, и папка «Коржики» превращается в мусор.
 */

const dir = mkdtempSync(join(tmpdir(), 'zip-test-'));
const bytes = (text: string) => new TextEncoder().encode(text);

function unpack(name: string, archive: Uint8Array): string {
  const path = join(dir, name);
  writeFileSync(path, archive);

  // -t проверяет целостность и контрольные суммы всех записей.
  execFileSync('unzip', ['-t', path], { stdio: 'pipe' });

  return path;
}

afterAll(() => {
  try {
    execFileSync('rm', ['-rf', dir]);
  } catch {
    // Временная папка — не повод ронять прогон.
  }
});

describe('CRC32', () => {
  it('совпадает с эталонными значениями', () => {
    // Значения из спецификации и общеизвестные проверочные векторы.
    expect(crc32(new Uint8Array(0))).toBe(0);
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
    expect(crc32(bytes('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
  });
});

describe('архив', () => {
  it('распаковывается системным unzip без ошибок', () => {
    const archive = buildZip([
      { name: 'привет.txt', data: bytes('содержимое') },
      { name: 'папка/вложенный.txt', data: bytes('второй файл') },
    ]);

    const path = unpack('basic.zip', archive);
    const listing = execFileSync('unzip', ['-l', path], { encoding: 'utf8' });

    expect(listing).toContain('привет.txt');
    expect(listing).toContain('папка/вложенный.txt');
  });

  it('отдаёт файлы байт в байт', () => {
    // Двоичные данные, а не текст: именно они едут в архив, и
    // именно на них ломается неверная длина или смещение.
    const payload = new Uint8Array(5000);
    for (let i = 0; i < payload.length; i += 1) payload[i] = (i * 31) % 256;

    const path = unpack('binary.zip', buildZip([{ name: 'кадр.bin', data: payload }]));
    execFileSync('unzip', ['-o', path, '-d', join(dir, 'out')], { stdio: 'pipe' });

    const restored = readFileSync(join(dir, 'out', 'кадр.bin'));
    expect(new Uint8Array(restored)).toEqual(payload);
  });

  it('сохраняет кириллицу в именах и папках', () => {
    const path = unpack(
      'cyrillic.zip',
      buildZip([{ name: 'Коржики/059 — Ратуша.jpg', data: bytes('кадр') }]),
    );

    execFileSync('unzip', ['-o', path, '-d', join(dir, 'ru')], { stdio: 'pipe' });

    const restored = readFileSync(join(dir, 'ru', 'Коржики', '059 — Ратуша.jpg'), 'utf8');
    expect(restored).toBe('кадр');
  });

  it('переживает пустой файл и пустой архив', () => {
    unpack('empty-entry.zip', buildZip([{ name: 'пусто.txt', data: new Uint8Array(0) }]));

    // Пустой архив unzip считает ошибкой, поэтому проверяем сигнатуру:
    // это тоже валидный ZIP, просто без записей.
    const archive = buildZip([]);
    expect(Array.from(archive.slice(0, 4))).toEqual([0x50, 0x4b, 0x05, 0x06]);
    expect(archive.length).toBe(22);
  });

  it('складывает много файлов подряд', () => {
    const entries = Array.from({ length: 120 }, (_, i) => ({
      name: `команда-${(i % 5) + 1}/кадр-${String(i).padStart(3, '0')}.bin`,
      data: new Uint8Array(700 + i).fill(i % 256),
    }));

    const path = unpack('many.zip', buildZip(entries));
    const listing = execFileSync('unzip', ['-l', path], { encoding: 'utf8' });

    expect(listing).toContain('кадр-119.bin');
    expect(listing).toMatch(/120 files/);
  });

  it('не молчит про размер больше четырёх гигабайт', () => {
    // Настоящий такой файл в тесте не создать, поэтому проверяется
    // сама граница: подделываем длину, не выделяя память.
    const huge = { name: 'огромный.bin', data: { length: 0x100000000 } as unknown as Uint8Array };
    expect(() => buildZip([huge])).toThrow(/ZIP64/);
  });
});

describe('имена файлов', () => {
  it('убирает запрещённые в Windows символы', () => {
    expect(safeFileName('Мем: "что?" / <всё>')).toBe('Мем что всё');
  });

  it('не оставляет имя пустым', () => {
    expect(safeFileName('///')).toBe('без названия');
    expect(safeFileName('   ', 'кадр')).toBe('кадр');
  });

  it('обрезает длинное имя', () => {
    expect(safeFileName('я'.repeat(200)).length).toBe(80);
  });

  it('снимает точки по краям', () => {
    // Имя, начинающееся с точки, на Windows создаётся с трудом, а
    // заканчивающееся точкой — не создаётся вовсе.
    expect(safeFileName('.скрытый.')).toBe('скрытый');
  });
});
