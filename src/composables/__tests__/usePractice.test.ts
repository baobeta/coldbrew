import { describe, it, expect } from 'vitest';
import { levenshtein, normalize, compareWords } from '../usePractice';

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
  });

  it('returns the length of the other string when one is empty', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('returns 0 for two empty strings', () => {
    expect(levenshtein('', '')).toBe(0);
  });

  it('counts single character substitution', () => {
    expect(levenshtein('cat', 'bat')).toBe(1);
  });

  it('counts single character insertion', () => {
    expect(levenshtein('cat', 'cats')).toBe(1);
  });

  it('counts single character deletion', () => {
    expect(levenshtein('cats', 'cat')).toBe(1);
  });

  it('handles completely different strings', () => {
    expect(levenshtein('abc', 'xyz')).toBe(3);
  });

  it('handles transpositions as two edits', () => {
    expect(levenshtein('ab', 'ba')).toBe(2);
  });
});

describe('normalize', () => {
  it('lowercases text', () => {
    expect(normalize('Hello')).toBe('hello');
  });

  it('strips punctuation', () => {
    expect(normalize('hello!')).toBe('hello');
    expect(normalize("don't")).toBe('dont');
    expect(normalize('world.')).toBe('world');
    expect(normalize('"quoted"')).toBe('quoted');
  });

  it('preserves numbers', () => {
    expect(normalize('test123')).toBe('test123');
  });

  it('returns empty string for punctuation-only input', () => {
    expect(normalize('...')).toBe('');
    expect(normalize('!')).toBe('');
  });

  it('handles empty string', () => {
    expect(normalize('')).toBe('');
  });
});

describe('compareWords', () => {
  it('marks all words correct when spoken matches exactly', () => {
    const results = compareWords(
      ['The', 'weather', 'is', 'nice'],
      ['The', 'weather', 'is', 'nice'],
    );
    expect(results.every(r => r.status === 'correct')).toBe(true);
  });

  it('is case-insensitive', () => {
    const results = compareWords(
      ['Hello', 'World'],
      ['hello', 'world'],
    );
    expect(results[0].status).toBe('correct');
    expect(results[1].status).toBe('correct');
  });

  it('ignores punctuation in comparison', () => {
    const results = compareWords(
      ['Hello,', 'world!'],
      ['Hello', 'world'],
    );
    expect(results[0].status).toBe('correct');
    expect(results[1].status).toBe('correct');
  });

  it('marks missing words when spoken text is shorter', () => {
    const results = compareWords(
      ['The', 'weather', 'is', 'beautiful', 'today'],
      ['The', 'weather'],
    );
    expect(results[0].status).toBe('correct');
    expect(results[1].status).toBe('correct');
    expect(results[2].status).toBe('missing');
    expect(results[3].status).toBe('missing');
    expect(results[4].status).toBe('missing');
  });

  it('marks wrong words when completely different', () => {
    const results = compareWords(
      ['beach'],
      ['mountain'],
    );
    expect(results[0].status).toBe('wrong');
    expect(results[0].actual).toBe('mountain');
  });

  it('marks close words within levenshtein threshold', () => {
    // "beautiful" (9 chars) -> threshold = floor(9 * 0.3) = 2
    // "beautful" is 1 edit away -> close
    const results = compareWords(
      ['beautiful'],
      ['beautful'],
    );
    expect(results[0].status).toBe('close');
  });

  it('marks close for minor misspelling', () => {
    // "weather" (7 chars) -> threshold = floor(7 * 0.3) = 2
    // "wether" is 1 edit away -> close
    const results = compareWords(
      ['weather'],
      ['wether'],
    );
    expect(results[0].status).toBe('close');
  });

  it('marks wrong when edit distance exceeds threshold', () => {
    // "the" (3 chars) -> threshold = max(1, floor(3 * 0.3)) = 1
    // "da" is 2 edits away -> wrong
    const results = compareWords(
      ['the'],
      ['da'],
    );
    expect(results[0].status).toBe('wrong');
  });

  it('handles punctuation-only expected words as correct', () => {
    const results = compareWords(
      ['...', 'hello'],
      ['hello'],
    );
    // Punctuation-only normalizes to empty string -> treated as correct
    expect(results[0].status).toBe('correct');
  });

  it('handles a full sentence with mixed results', () => {
    const results = compareWords(
      ['The', 'weather', 'is', 'beautiful', 'today'],
      ['The', 'wetter', 'is', 'bootiful', 'today'],
    );
    expect(results[0].status).toBe('correct');   // The -> The
    expect(results[1].status).toBe('close');      // weather -> wetter (2 edits, threshold 2)
    expect(results[2].status).toBe('correct');    // is -> is
    expect(results[3].status).toBe('wrong');      // beautiful -> bootiful (3 edits, threshold 2)
    expect(results[4].status).toBe('correct');    // today -> today
  });

  it('preserves original expected word in result', () => {
    const results = compareWords(
      ['Hello,'],
      ['hello'],
    );
    expect(results[0].expected).toBe('Hello,');
    expect(results[0].actual).toBe('hello');
  });

  it('returns empty array for empty input', () => {
    const results = compareWords([], []);
    expect(results).toEqual([]);
  });

  it('handles single word correct', () => {
    const results = compareWords(['pronunciation'], ['pronunciation']);
    expect(results[0].status).toBe('correct');
  });

  it('handles single word wrong', () => {
    const results = compareWords(['pronunciation'], ['announce']);
    expect(results[0].status).toBe('wrong');
  });

  it('extra spoken words are ignored', () => {
    const results = compareWords(
      ['hello'],
      ['hello', 'world', 'extra'],
    );
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('correct');
  });

  it('short words use minimum threshold of 1', () => {
    // "is" (2 chars) -> threshold = max(1, floor(2 * 0.3)) = max(1, 0) = 1
    // "as" is 1 edit away -> close
    const results = compareWords(['is'], ['as']);
    expect(results[0].status).toBe('close');
  });

  it('threshold scales with word length', () => {
    // "international" (13 chars) -> threshold = floor(13 * 0.3) = 3
    // "internashonal" is 2 edits away -> close
    const results = compareWords(['international'], ['internashonal']);
    expect(results[0].status).toBe('close');
  });
});
