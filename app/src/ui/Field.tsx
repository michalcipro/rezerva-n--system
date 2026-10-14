import { cloneElement, isValidElement, useId, type ReactNode } from 'react';
import { Icon } from './Icon';
import { cssVars, cx } from './utils';

export interface FieldProps {
  label: ReactNode;
  /** Single form control (Input, Select, Textarea, NumberInput…). It receives id + aria wiring. */
  children: ReactNode;
  hint?: ReactNode;
  /** Error text; also marks the control aria-invalid. */
  error?: ReactNode;
  /** Use when the child already has its own id. */
  htmlFor?: string;
  /** Label column on the left (settings forms); stacks on phones. */
  inline?: boolean;
  /** Width of the label column when inline. Default 200. */
  labelWidth?: number;
  /** Appends „(nepovinné)“ to the label. */
  optional?: boolean;
  className?: string;
}

interface ControlA11yProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
}

/** Label + control + hint/error with correct id / aria-describedby wiring. */
export function Field({
  label,
  children,
  hint,
  error,
  htmlFor,
  inline,
  labelWidth,
  optional,
  className,
}: FieldProps) {
  const autoId = useId();
  const child = isValidElement<ControlA11yProps>(children) ? children : null;
  const controlId = htmlFor ?? child?.props.id ?? `${autoId}control`;
  const hintId = hint ? `${autoId}hint` : undefined;
  const errorId = error ? `${autoId}error` : undefined;
  const describedBy =
    [child?.props['aria-describedby'], errorId, hintId].filter(Boolean).join(' ') || undefined;

  const control = child
    ? cloneElement(child, {
        id: controlId,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : child.props['aria-invalid'],
      })
    : children;

  const labelEl = (
    <label className="field__label" htmlFor={controlId}>
      {label}
      {optional && <span className="field__optional"> (nepovinné)</span>}
    </label>
  );
  const messages = (
    <>
      {error && (
        <span id={errorId} className="field__error">
          <Icon name="alertCircle" size={14} />
          <span>{error}</span>
        </span>
      )}
      {hint && (
        <span id={hintId} className="field__hint">
          {hint}
        </span>
      )}
    </>
  );

  if (inline) {
    return (
      <div
        className={cx('field', 'field--inline', className)}
        style={labelWidth ? cssVars({ '--field-label-w': `${labelWidth}px` }) : undefined}
      >
        <div className="field__label-col">{labelEl}</div>
        <div className="field__control-col">
          {control}
          {messages}
        </div>
      </div>
    );
  }

  return (
    <div className={cx('field', className)}>
      {labelEl}
      {control}
      {messages}
    </div>
  );
}
