import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Loader2 } from "lucide-react";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-zinc-900 text-white hover:bg-zinc-700 active:bg-zinc-800 shadow-sm",
  secondary: "bg-white text-zinc-800 border border-zinc-200 hover:bg-zinc-50 active:bg-zinc-100 shadow-sm",
  outline: "bg-transparent text-zinc-700 border border-zinc-300 hover:bg-zinc-100",
  ghost: "bg-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
  danger: "bg-red-600 text-white hover:bg-red-500 shadow-sm",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-2.5 text-xs gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
  icon: "h-9 w-9 justify-center",
};

const BASE =
  "inline-flex items-center justify-center rounded-lg font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 disabled:opacity-50 disabled:pointer-events-none select-none";

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button className={cn(BASE, VARIANTS[variant], SIZES[size], className)} disabled={loading || props.disabled} {...props}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD, className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(FIELD, "pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(FIELD, "min-h-20 resize-y", className)} {...props} />;
}

const FIELD =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10 disabled:bg-zinc-50";

const SWATCHES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

/** A hex color field: a native color-well swatch, a type-in hex box, and eight quick-pick presets. */
export function ColorField({ value, onChange, className }: { value: string; onChange: (hex: string) => void; className?: string }) {
  const swatch = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#898781";
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={swatch}
          onChange={(e) => onChange(e.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded-md border border-zinc-200 p-0.5"
          aria-label="Pick a color"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="#2a78d6" className="min-w-0" />
      </div>
      <div className="flex flex-wrap gap-1">
        {SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            onClick={() => onChange(hex)}
            title={hex}
            className={cn("size-4 rounded-full ring-1 ring-inset ring-black/10", value.toLowerCase() === hex && "ring-2 ring-zinc-900")}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="block text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-zinc-400">{hint}</span> : null}
    </label>
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-zinc-200 bg-white p-4 shadow-sm", className)} {...props} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-zinc-400", className)} />;
}

export function Pill({ label, color, className }: { label: string; color?: string; className?: string }) {
  const c = color || "#898781";
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", className)}
      style={{ backgroundColor: `${c}1c`, color: c }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: c }} />
      {label}
    </span>
  );
}

export function Empty({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 py-12 text-center">
      {icon}
      <p className="text-sm font-medium text-zinc-600">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-zinc-400">{hint}</p> : null}
    </div>
  );
}

export function SectionHeading({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      {actions}
    </div>
  );
}

export function PageShell({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-zinc-500">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}