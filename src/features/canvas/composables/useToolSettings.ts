import { ref, watch } from 'vue';
import type { CanvasTool } from '../types';

const STORAGE_KEY = 'writeboard-canvas-tools';

export const STROKE_SIZES = [2, 4, 8, 16];
export const STROKE_COLORS = ['#1c1917', '#2563eb', '#dc2626', '#16a34a'];

interface ToolSettings {
  tool: CanvasTool;
  color: string;
  size: number;
}

const DEFAULTS: ToolSettings = { tool: 'pen', color: STROKE_COLORS[0], size: STROKE_SIZES[1] };

function loadSettings(): ToolSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return {
      tool: ['pen', 'highlighter', 'eraser'].includes(saved.tool) ? saved.tool : DEFAULTS.tool,
      color: STROKE_COLORS.includes(saved.color) ? saved.color : DEFAULTS.color,
      size: STROKE_SIZES.includes(saved.size) ? saved.size : DEFAULTS.size,
    };
  } catch {
    return DEFAULTS;
  }
}

export function useToolSettings() {
  const saved = loadSettings();
  const tool = ref(saved.tool);
  const color = ref(saved.color);
  const size = ref(saved.size);

  watch([tool, color, size], () => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ tool: tool.value, color: color.value, size: size.value }),
      );
    } catch {
      // Losing tool settings is harmless, and storage can be blocked in private mode.
    }
  });

  function stepSize(direction: 1 | -1): void {
    const index = STROKE_SIZES.indexOf(size.value) + direction;
    size.value = STROKE_SIZES[Math.min(STROKE_SIZES.length - 1, Math.max(0, index))];
  }

  return { tool, color, size, stepSize };
}
