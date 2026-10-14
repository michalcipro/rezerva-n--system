import {
  forwardRef,
  useId,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { cx } from './utils';

export interface SwitchProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'size' | 'checked' | 'defaultChecked'> {
  checked: boolean;
  onChange: (checked: boolean, event: ChangeEvent<HTMLInputElement>) => void;
  label?: ReactNode;
  description?: ReactNode;
  /** start = text left, switch right (automation lists, default) · end = switch first. */
  labelPosition?: 'start' | 'end';
}

/** On/off toggle (32×18 track). Native checkbox with role="switch". */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { checked, onChange, label, description, labelPosition = 'start', disabled, className, ...rest },
  ref,
) {
  const id = useId();
  const labelId = label != null ? `${id}label` : undefined;
  const descriptionId = description != null ? `${id}desc` : undefined;
  return (
    <label className={cx('switch', labelPosition === 'end' && 'switch--label-end', disabled && 'is-disabled', className)}>
      {(label != null || description != null) && (
        <span className="switch__text">
          {label != null && (
            <span id={labelId} className="switch__label">
              {label}
            </span>
          )}
          {description != null && (
            <span id={descriptionId} className="switch__description">
              {description}
            </span>
          )}
        </span>
      )}
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        className="switch__input"
        checked={checked}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        onChange={(event) => onChange(event.target.checked, event)}
        {...rest}
      />
      <span className="switch__track" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
    </label>
  );
});
