"use client";

// Pen size (Fine / Medium / Bold) and eraser size (Small / Large) for the writing screen's tool
// tray: a small segmented control of dots (a radiogroup with arrow-key navigation), remembered per
// device in localStorage (lib/toolSizes).
import { useCallback, useRef, useSyncExternalStore, type KeyboardEvent } from "react";

// ── Per-device memory ───────────────────────────────────────────────────────────────────────

/** Session copy, so a choice still sticks for this visit when localStorage is blocked. */
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function readStored(key: string): string | null {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode / blocked storage: the in-memory copy still applies for this visit.
  }
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** A choice remembered on this device; the server render (and hydration) uses `fallback`. */
export function useStoredChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (v: T) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => readStored(key),
    () => null,
  );
  const value = raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const set = useCallback((v: T) => writeStored(key, v), [key]);
  return [value, set];
}

// ── Picker ──────────────────────────────────────────────────────────────────────────────────

interface Option<T extends string> {
  id: T;
  label: string;
  /** Dot diameter in px (how big the size looks). */
  dot: number;
}

interface Props<T extends string> {
  /** "Pen size" / "Eraser size". */
  label: string;
  /** Testid prefix: `${testIdPrefix}-${option.id}`. */
  testIdPrefix: string;
  options: ReadonlyArray<Option<T>>;
  value: T;
  onChange: (v: T) => void;
  /** Eraser sizes draw as rings (what the eraser covers), pen sizes as filled ink dots. */
  ring?: boolean;
}

export default function ToolSizePicker<T extends string>({ label, testIdPrefix, options, value, onChange, ring = false }: Props<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = options.findIndex((o) => o.id === value);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % options.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-testid={`${testIdPrefix}-picker`}
      onKeyDown={onKeyDown}
      className="inline-flex items-center rounded-[13px]"
    >
      {options.map((o, i) => {
        const checked = o.id === value;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={o.label}
            title={`${label}: ${o.label}`}
            tabIndex={checked ? 0 : -1}
            data-testid={`${testIdPrefix}-${o.id}`}
            onClick={() => onChange(o.id)}
            className={`press inline-flex size-11 shrink-0 items-center justify-center rounded-[13px] ${
              checked ? "bg-chrome shadow-raised" : "hover:bg-chrome"
            }`}
          >
            <span
              aria-hidden="true"
              style={{ width: o.dot, height: o.dot }}
              className={`block rounded-pill ${
                ring
                  ? `border-2 ${checked ? "border-ink" : "border-ink-subtle"}`
                  : checked
                    ? "bg-ink"
                    : "bg-ink-subtle"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
