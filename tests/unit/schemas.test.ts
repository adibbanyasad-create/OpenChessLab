import { describe, expect, it } from 'vitest';
import { analysisSchema, benchmarkSchema, reviewSchema } from '../../src/shared/schemas';
import { DEFAULT_POSITION } from '../../src/shared/chess';
import { csvCell } from '../../src/shared/csv';
import { hostAllowed } from '../../src/server/app';

describe('strict input boundaries', () => {
  it('applies explicit safe defaults', () => {
    expect(analysisSchema.parse({ fen: DEFAULT_POSITION })).toEqual({
      fen: DEFAULT_POSITION,
      engineId: 'stockfish-lite',
      depth: 14,
      threads: 1,
      hash: 64,
      multiPv: 3,
    });
  });
  it.each([
    { depth: 0 },
    { depth: 25 },
    { depth: 4.5 },
    { threads: 5 },
    { threads: 0 },
    { hash: 513 },
    { hash: 0 },
    { multiPv: 6 },
    { depth: '12' },
    { command: '/bin/example' },
    { fen: DEFAULT_POSITION + '\nstop' },
  ])('rejects invalid resource and command inputs: %j', (input) => {
    expect(analysisSchema.safeParse({ fen: DEFAULT_POSITION, ...input }).success).toBe(false);
  });
  it('bounds reviews and excludes MultiPV competition', () => {
    expect(reviewSchema.safeParse({ pgn: '1. e4 *', depth: 15 }).success).toBe(false);
    expect(reviewSchema.safeParse({ pgn: '1. e4 *', multiPv: 3 }).success).toBe(false);
  });
  it('rejects duplicated engines and oversized benchmark suites', () => {
    const positions = [{ name: 'Start', fen: DEFAULT_POSITION }];
    expect(
      benchmarkSchema.safeParse({ engineIds: ['stockfish', 'stockfish'], positions }).success,
    ).toBe(false);
    expect(
      benchmarkSchema.safeParse({
        engineIds: ['stockfish'],
        positions: Array.from({ length: 9 }, () => positions[0]),
      }).success,
    ).toBe(false);
  });
});

describe('export and host boundaries', () => {
  it.each([
    '=SUM(A1)',
    '+1+2',
    '-1+2',
    '@SUM(A1)',
    '\tvalue',
    '\rvalue',
    '\nvalue',
    ' =1+2',
    '\uFEFF=1+2',
  ])('escapes spreadsheet formula-like strings', (value) => {
    expect(csvCell(value)).toBe(`"'${value}"`);
  });
  it('quotes CSV syntax without changing typed numeric values', () => {
    expect(csvCell('hello,"world"')).toBe('"hello,""world"""');
    expect(csvCell(-3.5)).toBe('"-3.5"');
    expect(csvCell(null)).toBe('');
  });
  it('matches exact hosts and only proper suffix boundaries', () => {
    const allowed = ['localhost', '127.0.0.1', '[::1]', '.e2b.app'];
    expect(hostAllowed('localhost:3001', allowed)).toBe(true);
    expect(hostAllowed('[::1]:3001', allowed)).toBe(true);
    expect(hostAllowed('3001-preview.e2b.app', allowed)).toBe(true);
    expect(hostAllowed('note2b.app', allowed)).toBe(false);
    expect(hostAllowed('localhost.example.org', allowed)).toBe(false);
    expect(hostAllowed('', allowed)).toBe(false);
  });
});
