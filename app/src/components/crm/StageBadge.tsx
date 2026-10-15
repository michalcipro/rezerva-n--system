import type { Id } from '../../domain/types';
import { getStage } from '../../engine/crm';
import { useClinic } from '../../store/hooks';
import { Badge, cx } from '../../ui';
import './crm.css';

export interface StageBadgeProps {
  stageId: Id;
  /** sm 18 px (výchozí, tabulky a karty) · md 22 px (hlavička karty klienta). */
  size?: 'sm' | 'md';
  className?: string;
}

/** Štítek fáze spolupráce v barvě fáze (tečka + název, nespoléhá jen na barvu). */
export function StageBadge({ stageId, size = 'sm', className }: StageBadgeProps): JSX.Element {
  const clinic = useClinic();
  const stage = getStage(clinic, stageId);
  if (!stage) {
    return (
      <Badge tone="neutral" size={size} className={cx('crm-stage', className)}>
        Bez fáze
      </Badge>
    );
  }
  return (
    <Badge tone={stage.tone} size={size} dot={stage.closed ? 'ring' : true} className={cx('crm-stage', className)}>
      {stage.name}
    </Badge>
  );
}
