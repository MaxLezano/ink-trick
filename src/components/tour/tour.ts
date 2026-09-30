/**
 * InkTrick - Guided tour state
 * Tiny external store (no React context): any screen can start the tour and the overlay (App.tsx)
 * renders it. Targets register their views so the overlay can measure and spotlight them.
 */
import { useSyncExternalStore } from 'react';
import type { View } from 'react-native';
import { markTourParts } from '../../services/storageService';
import { TOUR_STEPS, TourPart, TourRun } from './steps';

export interface TourState {
  active: boolean;
  run: TourRun;
  /** TOUR_STEPS indices shown this run: stops whose target is not on screen are left out. */
  order: number[];
  /** Position in `order`. */
  index: number;
  /** Direction of the last move, so a missing target is skipped the same way. */
  direction: 1 | -1;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const IDLE: TourState = { active: false, run: 'full', order: [], index: 0, direction: 1 };
let state: TourState = IDLE;
const listeners = new Set<() => void>();
const targets = new Map<string, { current: View | null }>();

function setState(next: TourState) {
  state = next;
  listeners.forEach(listener => listener());
}

function go(index: number, direction: 1 | -1) {
  if (index < 0) return;
  if (index >= state.order.length) {
    Tour.finish();
    return;
  }
  setState({ ...state, index, direction });
}

const stepsOf = (run: TourRun) => TOUR_STEPS.map((step, i) => (step.runs.includes(run) ? i : -1)).filter(i => i >= 0);

/** Steps of the run whose target is mounted right now (or that need none). */
const availableSteps = (run: TourRun) =>
  stepsOf(run).filter(i => !TOUR_STEPS[i].target || targets.has(TOUR_STEPS[i].target!));

/**
 * Parts this run really showed. The library part only counts when one of its books / collections
 * was on screen: a replay with an empty library must not cancel the automatic second part.
 */
function partsShown(): TourPart[] {
  const steps = state.order.map(i => TOUR_STEPS[i]);
  const parts: TourPart[] = [];
  if (steps.some(s => s.part === 'intro')) parts.push('intro');
  if (steps.some(s => s.part === 'library' && s.target)) parts.push('library');
  return parts;
}

export const Tour = {
  /** full: everything (first run with books, or a replay) · intro / library: one part only. */
  start(run: TourRun = 'full') {
    if (state.active) return;
    setState({ active: true, run, order: stepsOf(run), index: 0, direction: 1 });
  },
  next() {
    // Leaving the welcome step: the home screen has settled by now (a replay from "Mi lectura"
    // first returns to it), so this is when we know which stops exist.
    if (state.index === 0) state = { ...state, order: availableSteps(state.run) };
    go(state.index + 1, 1);
  },
  prev: () => go(state.index - 1, -1),
  /** The current step's target could not be measured: keep moving the same way. */
  skipMissing: () => go(state.index + state.direction, state.direction),
  /** Finished or skipped: the parts shown never start by themselves again ("Mi lectura" replays all). */
  finish() {
    // Skipping on the welcome step still counts as seen for the whole run.
    const parts = state.index === 0 ? (state.run === 'full' ? ['intro', 'library'] : [state.run]) : partsShown();
    setState(IDLE);
    markTourParts(parts as TourPart[]).catch(() => {});
  },
};

export function useTour(): TourState {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

export function registerTarget(id: string, ref: { current: View | null }) {
  targets.set(id, ref);
  return () => {
    if (targets.get(id) === ref) targets.delete(id);
  };
}

/** Window rect of a registered target, or null when it is missing or not laid out. */
export function measureTarget(id: string): Promise<Rect | null> {
  const view = targets.get(id)?.current;
  if (!view) return Promise.resolve(null);
  return new Promise(resolve => {
    view.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { x, y, width, height } : null));
  });
}
