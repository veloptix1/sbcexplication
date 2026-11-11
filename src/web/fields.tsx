import { useId, type ReactNode } from "react";

interface BaseProps {
  label: string;
  hint?: string | undefined;
}

export function Field({ label, hint, htmlFor, children }: BaseProps & { htmlFor?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

interface TextProps extends BaseProps {
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "url" | "tel" | "email";
  placeholder?: string | undefined;
  max?: number | undefined;
}

export function TextInput({ label, hint, value, onChange, type = "text", placeholder, max }: TextProps) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <input id={id} type={type} value={value} placeholder={placeholder} maxLength={max} autoComplete="off" spellCheck={type === "text"} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function TextArea({ label, hint, value, onChange, placeholder, max, rows = 4 }: Omit<TextProps, "type"> & { rows?: number }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <textarea id={id} rows={rows} value={value} placeholder={placeholder} maxLength={max} onChange={(e) => onChange(e.target.value)} />
      {max && value.length > max * 0.85 ? <p className="hint count">{value.length} / {max}</p> : null}
    </Field>
  );
}

export function Select<T extends string>({ label, hint, value, options, onChange }: BaseProps & { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>{text}</option>
        ))}
      </select>
    </Field>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div className="field" role="group" aria-label={label}>
      <span className="label">{label}</span>
      <div className="seg">
        {options.map(([v, text]) => (
          <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
