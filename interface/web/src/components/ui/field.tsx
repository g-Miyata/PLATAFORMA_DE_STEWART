import { Slider as RadixSlider, Switch as RadixSwitch } from 'radix-ui';
import { useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const inputBase =
  'h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-fg ' +
  'placeholder:text-muted disabled:opacity-50';

// ---------------- Campo numérico ----------------
interface NumberFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  label: ReactNode;
  value: number;
  onValueChange: (v: number) => void;
  unit?: string;
  hint?: ReactNode;
  hideLabel?: boolean;
  /** ids extras para aria-describedby (ex.: a faixa permitida) */
  describedBy?: string;
}

export function NumberField({ label, value, onValueChange, unit, hint, hideLabel, describedBy, className, id, ...props }: NumberFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  // Texto local: permite digitar "-" ou "1." sem o valor pular
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={inputId} className={cn('text-sm font-medium', hideLabel && 'sr-only')}>
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          className={cn(inputBase, unit && 'pr-12', 'tabular-nums')}
          value={draft ?? String(value)}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value.trim() !== '' && Number.isFinite(n)) onValueChange(n);
          }}
          onBlur={() => setDraft(null)}
          aria-describedby={[hint ? `${inputId}-hint` : '', describedBy ?? ''].join(' ').trim() || undefined}
          {...props}
        />
        {unit && (
          <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted">
            {unit}
          </span>
        )}
      </div>
      {hint && (
        <p id={`${inputId}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

// ---------------- Slider + campo numérico ----------------
interface SliderFieldProps {
  label: string;
  value: number;
  onValueChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit: string;
  /** nome da unidade por extenso para o leitor de tela ("milímetros") */
  unitSpoken: string;
  disabled?: boolean;
  digits?: number;
}

export function SliderField({ label, value, onValueChange, min, max, step = 1, unit, unitSpoken, disabled, digits = 1 }: SliderFieldProps) {
  const id = useId();
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const spoken = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: digits })}${unitSpoken ? ` ${unitSpoken}` : ''}`;
  return (
    <div className="grid grid-cols-[1fr_6.5rem] items-end gap-x-3 gap-y-1.5">
      <div className="col-span-2 flex items-baseline justify-between gap-2">
        <label id={`${id}-label`} htmlFor={`${id}-num`} className="text-sm font-medium">
          {label}
        </label>
        <span id={`${id}-range`} className="text-xs text-muted tabular-nums">
          <span className="sr-only">Faixa: de {spoken(min)} a {spoken(max)}</span>
          <span aria-hidden>
            {min} a {max} {unit}
          </span>
        </span>
      </div>
      <RadixSlider.Root
        className="relative flex h-10 touch-none select-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={([v]) => onValueChange(v)}
      >
        <RadixSlider.Track className="relative h-1.5 grow rounded-full bg-surface-3">
          <RadixSlider.Range className="absolute h-full rounded-full bg-brand" />
        </RadixSlider.Track>
        <RadixSlider.Thumb
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-range`}
          aria-valuetext={spoken(value)}
          className="block size-5 rounded-full border-2 border-brand bg-surface shadow focus-visible:outline-3 focus-visible:outline-focus"
        />
      </RadixSlider.Root>
      <NumberField
        label={unitSpoken ? `${label} (${unitSpoken})` : label}
        hideLabel
        id={`${id}-num`}
        describedBy={`${id}-range`}
        value={Number(value.toFixed(digits))}
        onValueChange={(v) => onValueChange(clamp(v))}
        min={min}
        max={max}
        step={step}
        unit={unit}
        disabled={disabled}
      />
    </div>
  );
}

// ---------------- Switch ----------------
interface SwitchFieldProps {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  tone?: 'brand' | 'danger';
}

export function SwitchField({ label, description, checked, onCheckedChange, disabled, tone = 'brand' }: SwitchFieldProps) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="text-xs text-muted">
            {description}
          </p>
        )}
      </div>
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={description ? `${id}-desc` : undefined}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border-strong bg-surface-3 transition-colors',
          'disabled:cursor-not-allowed disabled:opacity-50',
          tone === 'brand' ? 'data-[state=checked]:bg-primary' : 'data-[state=checked]:bg-danger',
          'data-[state=checked]:border-transparent',
        )}
      >
        <RadixSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-5" />
      </RadixSwitch.Root>
    </div>
  );
}

// ---------------- Select nativo ----------------
interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: ReactNode;
  hideLabel?: boolean;
}

export function SelectField({ label, hideLabel, className, id, children, ...props }: SelectFieldProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={selectId} className={cn('text-sm font-medium', hideLabel && 'sr-only')}>
        {label}
      </label>
      <select id={selectId} className={cn(inputBase, 'pr-8')} {...props}>
        {children}
      </select>
    </div>
  );
}

export const inputClass = inputBase;
