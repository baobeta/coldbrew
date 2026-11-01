<template>
  <div
    ref="surface"
    data-test="canvas-surface"
    class="relative overflow-hidden bg-white"
    :class="surfaceCursor"
    style="touch-action: none"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerEnd"
    @pointercancel="onPointerEnd"
    @pointerleave="ringVisible = false"
    @wheel.prevent="onWheel"
    @contextmenu.prevent
  >
    <canvas ref="inkCanvas" class="absolute inset-0 w-full h-full"></canvas>
    <canvas ref="liveCanvas" class="absolute inset-0 w-full h-full"></canvas>
    <div
      v-show="ringVisible && !isPanning"
      ref="ring"
      data-test="hover-ring"
      class="absolute top-0 left-0 rounded-full border border-black/50 pointer-events-none"
    ></div>
    <CanvasToolbar
      v-model:tool="tool"
      v-model:color="color"
      :size="size"
      :zoom-percent="Math.round(view.zoom * 100)"
      @step-size="stepSize"
      @undo="undo"
      @redo="redo"
      @zoom="zoomFromCenter"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useEventListener, useResizeObserver } from '@vueuse/core';
import { nanoid } from 'nanoid';
import CanvasToolbar from './CanvasToolbar.vue';
import { useLivePreview } from '@/features/canvas/composables/useLivePreview';
import { useStrokes } from '@/features/canvas/composables/useStrokes';
import { useToolSettings } from '@/features/canvas/composables/useToolSettings';
import { screenToCanvas, useViewport } from '@/features/canvas/composables/useViewport';
import {
  appendedCount,
  applyView,
  createStrokeCache,
  fillStroke,
  hitsStroke,
  intersects,
  liveAlpha,
  strokePath,
  visibleBounds,
} from '@/features/canvas/renderer';
import { applyPressureCurve } from '@/features/canvas/pressure';
import { commandForKey, isTypingTarget } from '@/features/canvas/shortcuts';
import { encodePoints } from '@/features/canvas/strokeCodec';
import { createStrokeBuilder } from '@/features/canvas/strokeBuilder';

const HIGHLIGHTER_RING_SCALE = 4;
const ERASER_RADIUS = 10; // screen pixels
const MIN_POINT_DISTANCE = 0.5; // screen pixels
const WHEEL_ZOOM_SPEED = 0.01;

const props = defineProps({
  pageId: { type: String, required: true },
  strokes: { type: Object, required: true },
  provider: { type: Object, required: true },
});

const surface = ref(null);
const inkCanvas = ref(null);
const liveCanvas = ref(null);
const ring = ref(null);
const ringVisible = ref(false);
const isPanning = ref(false);
const spaceHeld = ref(false);

const { tool, color, size, stepSize } = useToolSettings();
const { view, pan, zoom } = useViewport(props.pageId);
const { add, erase, undo, redo } = useStrokes(props.strokes);
const { previews, publish, clear } = useLivePreview(props.provider.awareness, scheduleLive);
const cache = createStrokeCache((d) => new Path2D(d));

const surfaceCursor = computed(() => {
  if (isPanning.value) return 'cursor-grabbing';
  return spaceHeld.value ? 'cursor-grab' : 'cursor-none';
});

let inkContext = null;
let liveContext = null;
let rect = { left: 0, top: 0, width: 0, height: 0 };
let pixelRatio = 1;
let inkFrame = 0;
let liveFrame = 0;
let activeStroke = null;
let predictedPoints = [];
let isErasing = false;
let lastPan = null;
let activePointerId = null;

function clearContext(context) {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  applyView(context, view.value, pixelRatio);
}

function drawRenderStroke(stroke) {
  fillStroke(inkContext, stroke.path, stroke.color, stroke.alpha);
}

function redrawInk() {
  inkFrame = 0;
  if (!inkContext) return;
  clearContext(inkContext);
  const visible = visibleBounds(view.value, rect.width, rect.height);
  for (const stroke of cache.sync(props.strokes.toArray())) {
    if (intersects(stroke.bounds, visible)) drawRenderStroke(stroke);
  }
}

function scheduleInk() {
  inkFrame ||= requestAnimationFrame(redrawInk);
}

function drawLiveStroke(points, style, last) {
  if (!points.length) return;
  fillStroke(
    liveContext,
    new Path2D(strokePath(points, style, last)),
    style.color,
    liveAlpha(style),
  );
}

function redrawLive() {
  liveFrame = 0;
  if (!liveContext) return;
  clearContext(liveContext);
  for (const preview of previews.value.values()) drawLiveStroke(preview.points, preview, false);
  if (activeStroke) {
    const style = {
      ...activeStroke.style,
      simulatePressure: activeStroke.builder.simulatePressure,
    };
    drawLiveStroke([...activeStroke.builder.points, ...predictedPoints], style, false);
  }
}

function scheduleLive() {
  liveFrame ||= requestAnimationFrame(redrawLive);
}

function onStrokesChanged(event) {
  const count = appendedCount(event.changes.delta, props.strokes.length);
  if (!count || !inkContext || inkFrame) return scheduleInk();
  const records = props.strokes.toArray();
  cache.sync(records);
  for (const record of records.slice(-count)) {
    const stroke = cache.resolve(record);
    if (stroke) drawRenderStroke(stroke);
  }
}

function resize() {
  rect = surface.value.getBoundingClientRect();
  pixelRatio = window.devicePixelRatio || 1;
  for (const canvas of [inkCanvas.value, liveCanvas.value]) {
    canvas.width = Math.round(rect.width * pixelRatio);
    canvas.height = Math.round(rect.height * pixelRatio);
  }
  redrawInk();
  redrawLive();
}

function toCanvasSample(event) {
  const [x, y] = screenToCanvas(view.value, event.clientX - rect.left, event.clientY - rect.top);
  return { x, y, pressure: event.pressure };
}

function samplesFrom(event) {
  const coalesced = event.getCoalescedEvents?.() ?? [];
  return (coalesced.length ? coalesced : [event]).map(toCanvasSample);
}

function eraseAt(sample) {
  const radius = ERASER_RADIUS / view.value.zoom;
  for (const stroke of cache.sync(props.strokes.toArray())) {
    if (hitsStroke(stroke, sample.x, sample.y, radius)) erase(stroke.id);
  }
}

function startStroke(sample) {
  const builder = createStrokeBuilder(MIN_POINT_DISTANCE / view.value.zoom);
  activeStroke = {
    id: nanoid(8),
    builder,
    style: { tool: tool.value, color: color.value, size: size.value, simulatePressure: true },
  };
  builder.add(sample);
  scheduleLive();
}

function finishStroke() {
  if (!activeStroke) return;
  const { id, builder, style } = activeStroke;
  activeStroke = null;
  predictedPoints = [];
  add({
    ...style,
    id,
    simulatePressure: builder.simulatePressure,
    pts: encodePoints(builder.points),
  });
  clear();
  scheduleLive();
}

function updateRing(event) {
  const diameter =
    tool.value === 'eraser'
      ? ERASER_RADIUS * 2
      : size.value * view.value.zoom * (tool.value === 'highlighter' ? HIGHLIGHTER_RING_SCALE : 1);
  const x = event.clientX - rect.left - diameter / 2;
  const y = event.clientY - rect.top - diameter / 2;
  ring.value.style.width = `${diameter}px`;
  ring.value.style.height = `${diameter}px`;
  ring.value.style.transform = `translate(${x}px, ${y}px)`;
  ringVisible.value = true;
}

function onPointerDown(event) {
  // The first pointer owns the interaction, so a palm or second finger can't end its stroke.
  if (activePointerId !== null) return;
  rect = surface.value.getBoundingClientRect();
  surface.value.setPointerCapture?.(event.pointerId);
  if (event.button === 1 || (event.button === 0 && spaceHeld.value)) {
    isPanning.value = true;
    lastPan = [event.clientX, event.clientY];
  } else if (event.button === 0 && tool.value === 'eraser') {
    isErasing = true;
    eraseAt(toCanvasSample(event));
  } else if (event.button === 0) {
    startStroke(toCanvasSample(event));
  } else {
    return;
  }
  activePointerId = event.pointerId;
}

function onPointerMove(event) {
  if (activePointerId !== null && event.pointerId !== activePointerId) return;
  updateRing(event);
  if (isPanning.value) {
    pan(event.clientX - lastPan[0], event.clientY - lastPan[1]);
    lastPan = [event.clientX, event.clientY];
  } else if (isErasing) {
    samplesFrom(event).forEach(eraseAt);
  } else if (activeStroke) {
    samplesFrom(event).forEach(activeStroke.builder.add);
    predictedPoints = (event.getPredictedEvents?.() ?? [])
      .map(toCanvasSample)
      .map(({ x, y, pressure }) => [x, y, applyPressureCurve(pressure)]);
    const { id, builder, style } = activeStroke;
    publish(
      id,
      { ...style, simulatePressure: builder.simulatePressure },
      builder.takeUnsent,
      event.timeStamp,
    );
    scheduleLive();
  }
}

function endInteraction() {
  activePointerId = null;
  isPanning.value = false;
  isErasing = false;
  finishStroke();
}

function onPointerEnd(event) {
  if (event.pointerId === activePointerId) endInteraction();
}

// Keyup never arrives if space is released in another window.
function onWindowBlur() {
  spaceHeld.value = false;
  endInteraction();
}

function onWheel(event) {
  if (event.ctrlKey || event.metaKey) {
    const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED);
    zoom(event.clientX - rect.left, event.clientY - rect.top, factor);
  } else {
    pan(-event.deltaX, -event.deltaY);
  }
}

function zoomFromCenter(factor) {
  zoom(rect.width / 2, rect.height / 2, factor);
}

const commands = {
  pen: () => (tool.value = 'pen'),
  highlighter: () => (tool.value = 'highlighter'),
  eraser: () => (tool.value = 'eraser'),
  'size-down': () => stepSize(-1),
  'size-up': () => stepSize(1),
  undo,
  redo,
};

function onKeyDown(event) {
  if (isTypingTarget(event.target)) return;
  if (event.code === 'Space') {
    event.preventDefault();
    spaceHeld.value = true;
    return;
  }
  const command = commandForKey(event);
  if (!command) return;
  event.preventDefault();
  commands[command]();
}

function onKeyUp(event) {
  if (event.code === 'Space') spaceHeld.value = false;
}

useEventListener(window, 'keydown', onKeyDown);
useEventListener(window, 'keyup', onKeyUp);
useEventListener(window, 'blur', onWindowBlur);
useResizeObserver(surface, resize);

watch(view, () => {
  scheduleInk();
  scheduleLive();
});

onMounted(() => {
  inkContext = inkCanvas.value.getContext('2d');
  liveContext = liveCanvas.value.getContext('2d', { desynchronized: true });
  resize();
  props.strokes.observe(onStrokesChanged);
});

onBeforeUnmount(() => {
  finishStroke();
  props.strokes.unobserve(onStrokesChanged);
  cancelAnimationFrame(inkFrame);
  cancelAnimationFrame(liveFrame);
});
</script>
