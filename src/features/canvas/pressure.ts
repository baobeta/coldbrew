// A device with no pressure sensor reports exactly this while pressed.
const SIMULATED_PRESSED_VALUE = 0.5;
// Below 1 lifts light pressure. The XP-Pen Deco 640 peaked at 0.275 in testing.
const PRESSURE_CURVE = 0.55;

// Don't use pointerType here: Chrome on macOS reports the XP-Pen as `mouse`.
export function isRealPressure(pressure: number): boolean {
  return pressure > 0 && pressure !== SIMULATED_PRESSED_VALUE;
}

export function applyPressureCurve(pressure: number): number {
  return Math.pow(Math.min(1, Math.max(0, pressure)), PRESSURE_CURVE);
}
