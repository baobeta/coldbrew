import { describe, it, expect, beforeEach } from 'vitest';
import { nextTick } from 'vue';
import { STROKE_COLORS, useToolSettings } from '../composables/useToolSettings';

describe('useToolSettings', () => {
  beforeEach(() => localStorage.clear());

  it('starts with the pen', () => {
    const { tool, color, size } = useToolSettings();
    expect(tool.value).toBe('pen');
    expect(color.value).toBe(STROKE_COLORS[0]);
    expect(size.value).toBe(4);
  });

  it('remembers settings on this device', async () => {
    const first = useToolSettings();
    first.tool.value = 'highlighter';
    first.color.value = STROKE_COLORS[2];
    await nextTick();
    const second = useToolSettings();
    expect(second.tool.value).toBe('highlighter');
    expect(second.color.value).toBe(STROKE_COLORS[2]);
  });

  it('steps through sizes and stops at each end', () => {
    const { size, stepSize } = useToolSettings();
    stepSize(1);
    expect(size.value).toBe(8);
    stepSize(1);
    stepSize(1);
    expect(size.value).toBe(16);
    stepSize(-1);
    stepSize(-1);
    stepSize(-1);
    stepSize(-1);
    expect(size.value).toBe(2);
  });

  it('ignores bad saved settings', () => {
    localStorage.setItem('writeboard-canvas-tools', '{"tool":"laser","color":"red","size":999}');
    const { tool, color, size } = useToolSettings();
    expect(tool.value).toBe('pen');
    expect(color.value).toBe(STROKE_COLORS[0]);
    expect(size.value).toBe(4);
  });

  it('falls back on broken saved settings', () => {
    localStorage.setItem('writeboard-canvas-tools', '{not json');
    expect(useToolSettings().tool.value).toBe('pen');
  });
});
