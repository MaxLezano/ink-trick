/**
 * InkTrick - Guided tour state
 * Tiny external store (no React context): any screen can start the tour and the overlay (App.tsx)
 * renders it. Targets register their views so the overlay can measure and spotlight them.
 */
import { useSyncExternalStore } from 'react';
import type { View } from 'react-native';
import { markTourSeen } from '../../services/storageService';
import { TOUR_STEPS } from './steps';

export interface TourState {
  active: boolean;
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

const IDLE: TourState = { active: false, order: [], index: 0, direction: 1 };
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

/** Steps whose target is mounted right now (or that need none). */
const availableSteps = () =>
  TOUR_STEPS.map((step, i) => (!step.target || targets.has(step.target) ? i : -1)).filter(i => i >= 0);

export const Tour = {
  start() {
    if (state.active) return;
    setState({ active: true, order: TOUR_STEPS.map((_, i) => i), index: 0, direction: 1 });
  },
  next() {
    // Leaving the welcome step: the home screen has settled by now (a replay from "Mi lectura"
    // first returns to it), so this is when we know which stops exist.
    if (state.index === 0) state = { ...state, order: availableSteps() };
    go(state.index + 1, 1);
  },
  prev: () => go(state.index - 1, -1),
  /** The current step's target could not be measured: keep moving the same way. */
  skipMissing: () => go(state.index + state.direction, state.direction),
  /** Finished or skipped: it never starts by itself again ("Mi lectura" can replay it). */
  finish() {
    setState(IDLE);
    markTourSeen().catch(() => {});
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
