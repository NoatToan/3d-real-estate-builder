"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Box, Row, Text, TextFaint } from "./BasePrimitives";

const inputCls =
  "h-8 w-full min-w-0 rounded-md border border-line bg-surface px-2 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-surface-muted disabled:text-ink-faint";

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-ink-muted">
      {children}
    </label>
  );
}

/** Parses user input accepting both "," and "." as decimal separator. */
export function parseDecimal(text: string): number | null {
  const t = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const fmt = (n: number | null, decimals: number) =>
  n == null ? "" : String(Math.round(n * 10 ** decimals) / 10 ** decimals).replace(".", ",");

export interface NumberFieldProps {
  label?: string;
  value: number | null;
  onCommit: (n: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  suffix?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  autoFocus?: boolean;
  "aria-label"?: string;
}

/**
 * Numeric input that commits on Enter/blur, accepts "," decimals, clamps to [min, max]
 * and supports ↑/↓ stepping.
 */
export function NumberField({
  label,
  value,
  onCommit,
  min = -Infinity,
  max = Infinity,
  step = 0.1,
  decimals = 2,
  suffix,
  allowEmpty = false,
  disabled,
  placeholder,
  className = "",
  id,
  autoFocus,
  ...rest
}: NumberFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [text, setText] = useState(fmt(value, decimals));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(fmt(value, decimals));
  }, [value, decimals]);

  const commit = (raw: string) => {
    const n = parseDecimal(raw);
    if (n == null) {
      if (allowEmpty) onCommit(null);
      else setText(fmt(value, decimals));
      return;
    }
    const clamped = Math.min(max, Math.max(min, n));
    setText(fmt(clamped, decimals));
    if (clamped !== value) onCommit(clamped);
  };

  // Typed but not yet committed when the field goes away (e.g. another object was picked): save it to this field's object.
  const pending = useRef<() => void>(() => {});
  useEffect(() => {
    pending.current = () => {
      if (focused.current && text !== fmt(value, decimals)) commit(text);
    };
  });
  useEffect(() => () => pending.current(), []);

  return (
    <Box className={className}>
      {label && <FieldLabel htmlFor={inputId}>{label}</FieldLabel>}
      <Box className="relative">
        <input
          id={inputId}
          inputMode="decimal"
          autoComplete="off"
          className={`${inputCls} ${suffix ? "pr-9" : ""}`}
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-label={rest["aria-label"] ?? label}
          onFocus={(e) => {
            focused.current = true;
            e.currentTarget.select();
          }}
          onBlur={(e) => {
            focused.current = false;
            commit(e.currentTarget.value);
          }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              commit(e.currentTarget.value);
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              setText(fmt(value, decimals));
              e.currentTarget.blur();
            } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              const base = parseDecimal(e.currentTarget.value) ?? value ?? 0;
              const next = Math.min(max, Math.max(min, base + (e.key === "ArrowUp" ? step : -step) * (e.shiftKey ? 10 : 1)));
              setText(fmt(next, decimals));
              onCommit(Math.round(next * 1e6) / 1e6);
            }
          }}
        />
        {suffix && <TextFaint className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs">{suffix}</TextFaint>}
      </Box>
    </Box>
  );
}

export interface TextFieldProps {
  label?: string;
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  autoFocus?: boolean;
  /** Commit on every keystroke instead of on blur. */
  live?: boolean;
}

export function TextField({ label, value, onCommit, placeholder, maxLength = 200, className = "", autoFocus, live }: TextFieldProps) {
  const id = useId();
  const [text, setText] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  const pending = useRef<() => void>(() => {});
  useEffect(() => {
    pending.current = () => {
      if (focused.current && !live && text !== value) onCommit(text);
    };
  });
  useEffect(() => () => pending.current(), []);
  return (
    <Box className={className}>
      {label && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
      <input
        id={id}
        className={inputCls}
        value={text}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus={autoFocus}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          if (text !== value) onCommit(text);
        }}
        onChange={(e) => {
          setText(e.target.value);
          if (live) onCommit(e.target.value);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setText(value);
            e.currentTarget.blur();
          }
        }}
      />
    </Box>
  );
}

export interface SelectFieldProps<T extends string> {
  label?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}

export function SelectField<T extends string>({ label, value, options, onChange, className = "" }: SelectFieldProps<T>) {
  const id = useId();
  return (
    <Box className={className}>
      {label && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
      <select id={id} className={inputCls} value={value} onChange={(e) => onChange(e.target.value as T)} onKeyDown={(e) => e.stopPropagation()}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Box>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <Row className="items-start justify-between gap-3 py-1">
      <label htmlFor={id} className="text-sm text-ink">
        {label}
        {hint && <TextFaint className="block text-xs">{hint}</TextFaint>}
      </label>
      <button
        id={id}
        role="switch"
        type="button"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 ${
          checked ? "bg-brand-600" : "bg-line-strong"
        }`}
      >
        <Text className={`inline-block h-4 w-4 rounded-full bg-surface shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </Row>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  compact = false,
}: {
  value: T;
  options: readonly { value: T; label: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  /** Icons only (labels kept for screen readers and tooltips), for narrow screens. */
  compact?: boolean;
}) {
  return (
    <Row role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`inline-flex h-7 items-center gap-1 rounded px-2.5 text-xs font-medium transition-colors ${
            value === o.value ? "bg-brand-600 text-white" : "text-ink-muted hover:bg-surface-muted"
          }`}
        >
          {o.icon}
          {compact && o.icon ? <span className="sr-only">{o.label}</span> : o.label}
        </button>
      ))}
    </Row>
  );
}
