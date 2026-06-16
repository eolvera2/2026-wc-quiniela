import { describe, expect, it } from 'vitest';
import { TextOverflowError, fitTextRamp, wrapText } from './tokens.js';

describe('wrapText', () => {
  it('returns all words when they fit', () => {
    expect(wrapText('hola mundo', 6, 2)).toEqual(['hola', 'mundo']);
  });

  it('throws TextOverflowError when words would be dropped', () => {
    expect(() => wrapText('Bienvenido a PredictaGol: tu Mundial se pronostica con amigos'.toUpperCase(), 12, 4)).toThrow(
      TextOverflowError,
    );
  });

  it('does not throw when maxLines is unbounded', () => {
    const lines = wrapText('Bienvenido a PredictaGol: tu Mundial se pronostica con amigos'.toUpperCase(), 12);
    expect(lines.join(' ').replace(/\s+/g, ' ')).toEqual(
      'BIENVENIDO A PREDICTAGOL: TU MUNDIAL SE PRONOSTICA CON AMIGOS'.replace(/\s+/g, ' '),
    );
  });
});

describe('fitTextRamp', () => {
  const ramp = [
    { chars: 11, lines: 4, font: 136 },
    { chars: 18, lines: 5, font: 96 },
    { chars: 28, lines: 6, font: 74 },
  ];

  it('returns the first step that fits', () => {
    const result = fitTextRamp('Hola mundo', ramp);
    expect(result.fontSize).toBe(136);
    expect(result.lines).toEqual(['Hola mundo']);
  });

  it('walks down the ramp until the text fits', () => {
    const result = fitTextRamp(
      'BIENVENIDO A PREDICTAGOL: TU MUNDIAL SE PRONOSTICA CON AMIGOS',
      ramp,
    );
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.lines.length).toBeLessThanOrEqual(6);
    expect(result.lines.join(' ').replace(/\s+/g, ' ')).toContain('PRONOSTICA');
    expect(result.lines.join(' ').replace(/\s+/g, ' ')).toContain('AMIGOS');
  });

  it('throws when no step in the ramp can fit the text', () => {
    const longText = Array.from({ length: 80 }, (_, i) => `palabra${i}`).join(' ');
    expect(() => fitTextRamp(longText, [{ chars: 8, lines: 2, font: 100 }])).toThrow(
      TextOverflowError,
    );
  });
});
