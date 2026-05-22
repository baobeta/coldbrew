import { describe, it, expect } from 'vitest';
import { levenshtein, normalize, compareWords } from '../usePractice';

describe('levenshtein (fastest-levenshtein)', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
  });

  it('returns the length of the other string when one is empty', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
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
});

describe('normalize', () => {
  it('lowercases text', () => {
    expect(normalize('Hello')).toBe('hello');
  });

  it('strips punctuation', () => {
    expect(normalize('hello!')).toBe('hello');
    expect(normalize("don't")).toBe('dont');
    expect(normalize('world.')).toBe('world');
  });

  it('preserves numbers', () => {
    expect(normalize('test123')).toBe('test123');
  });

  it('returns empty string for punctuation-only input', () => {
    expect(normalize('...')).toBe('');
  });

  it('handles empty string', () => {
    expect(normalize('')).toBe('');
  });
});

describe('compareWords (diff-based)', () => {
  it('marks all words correct when spoken matches exactly', () => {
    const results = compareWords(
      ['The', 'weather', 'is', 'nice'],
      ['The', 'weather', 'is', 'nice'],
    );
    expect(results.every(r => r.status === 'correct')).toBe(true);
    expect(results).toHaveLength(4);
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
    const statuses = results.map(r => r.status);
    expect(statuses[0]).toBe('correct');
    expect(statuses[1]).toBe('correct');
    expect(statuses).toContain('missing');
    expect(results.filter(r => r.status === 'missing')).toHaveLength(3);
  });

  it('marks wrong words when completely different', () => {
    const results = compareWords(
      ['beach'],
      ['mountain'],
    );
    expect(results[0].status).toBe('wrong');
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

  it('handles skipped words correctly (key improvement over positional)', () => {
    // Student skips "weather" — remaining words should still align
    const results = compareWords(
      ['The', 'weather', 'is', 'beautiful', 'today'],
      ['The', 'is', 'beautiful', 'today'],
    );
    const correct = results.filter(r => r.status === 'correct');
    const missing = results.filter(r => r.status === 'missing');
    expect(correct).toHaveLength(4);  // The, is, beautiful, today
    expect(missing).toHaveLength(1);  // weather
    expect(missing[0].expected).toBe('weather');
  });

  it('handles extra spoken words', () => {
    const results = compareWords(
      ['hello', 'world'],
      ['hello', 'big', 'world'],
    );
    const correct = results.filter(r => r.status === 'correct');
    const extra = results.filter(r => r.status === 'extra');
    expect(correct).toHaveLength(2);  // hello, world
    expect(extra).toHaveLength(1);    // big
    expect(extra[0].actual).toBe('big');
  });

  it('handles a full sentence with mixed results', () => {
    const results = compareWords(
      ['The', 'weather', 'is', 'beautiful', 'today'],
      ['The', 'wether', 'is', 'bootiful', 'today'],
    );
    const statusMap = results.reduce((acc, r) => {
      if (r.expected) acc[normalize(r.expected)] = r.status;
      return acc;
    }, {} as Record<string, string>);
    expect(statusMap['the']).toBe('correct');
    expect(statusMap['is']).toBe('correct');
    expect(statusMap['today']).toBe('correct');
    // "wether" is close to "weather" (1 edit, threshold 2)
    expect(statusMap['weather']).toBe('close');
    // "bootiful" vs "beautiful" (3 edits, threshold 2) -> wrong
    expect(statusMap['beautiful']).toBe('wrong');
  });

  it('preserves original expected word in result', () => {
    const results = compareWords(
      ['Hello,'],
      ['hello'],
    );
    expect(results[0].expected).toBe('Hello,');
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

  it('handles multiple skipped words', () => {
    const results = compareWords(
      ['I', 'would', 'like', 'to', 'go', 'home'],
      ['I', 'like', 'go', 'home'],
    );
    const correct = results.filter(r => r.status === 'correct');
    const missing = results.filter(r => r.status === 'missing');
    expect(correct).toHaveLength(4);  // I, like, go, home
    expect(missing).toHaveLength(2);  // would, to
  });

  it('handles completely empty spoken input', () => {
    const results = compareWords(
      ['hello', 'world'],
      [],
    );
    expect(results.every(r => r.status === 'missing')).toBe(true);
    expect(results).toHaveLength(2);
  });

  it('handles completely empty expected input', () => {
    const results = compareWords(
      [],
      ['hello', 'world'],
    );
    expect(results.every(r => r.status === 'extra')).toBe(true);
    expect(results).toHaveLength(2);
  });

  it('short words use minimum threshold of 1 for close detection', () => {
    // "is" (2 chars) -> threshold = max(1, floor(2 * 0.3)) = 1
    // "as" is 1 edit away -> close
    const results = compareWords(['is'], ['as']);
    expect(results[0].status).toBe('close');
  });

  it('threshold scales with word length for close detection', () => {
    // "international" (13 chars) -> threshold = floor(13 * 0.3) = 3
    // "internashonal" is 2 edits away -> close
    const results = compareWords(['international'], ['internashonal']);
    expect(results[0].status).toBe('close');
  });
});
