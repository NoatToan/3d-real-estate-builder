/**
 * Base layout & text primitives — the only components that render raw layout DOM.
 * Feature code composes these instead of writing <div>/<span>/<p> directly.
 */
import { createElement, forwardRef, type HTMLAttributes, type ReactNode } from "react";

type BoxTag = "div" | "section" | "header" | "main" | "aside" | "footer" | "nav" | "article" | "form";

export interface BoxProps extends HTMLAttributes<HTMLElement> {
  as?: BoxTag;
  children?: ReactNode;
}

export const Box = forwardRef<HTMLElement, BoxProps>(function Box({ as = "div", ...rest }, ref) {
  return createElement(as, { ref, ...rest });
});

export const Row = forwardRef<HTMLElement, BoxProps>(function Row({ className = "", ...rest }, ref) {
  return <Box ref={ref} className={`flex flex-row ${className}`} {...rest} />;
});

export const Col = forwardRef<HTMLElement, BoxProps>(function Col({ className = "", ...rest }, ref) {
  return <Box ref={ref} className={`flex flex-col ${className}`} {...rest} />;
});

type Tone = "primary" | "muted" | "faint" | "inherit";
const TONES: Record<Tone, string> = {
  primary: "text-ink",
  muted: "text-ink-muted",
  faint: "text-ink-faint",
  inherit: "",
};

export interface TextProps extends HTMLAttributes<HTMLElement> {
  as?: "span" | "p" | "strong" | "em" | "small" | "kbd" | "code";
  tone?: Tone;
  children?: ReactNode;
}

export function Text({ as = "span", tone = "inherit", className = "", ...rest }: TextProps) {
  return createElement(as, { className: `${TONES[tone]} ${className}`.trim(), ...rest });
}

export const TextPrimary = (p: Omit<TextProps, "tone">) => <Text tone="primary" {...p} />;
export const TextMuted = (p: Omit<TextProps, "tone">) => <Text tone="muted" {...p} />;
export const TextFaint = (p: Omit<TextProps, "tone">) => <Text tone="faint" {...p} />;
