/*
 * Pohyb UI kit — React primitives for the „Klinik“ design.
 * Styles: import 'src/styles/index.css' once at the app entry.
 * Catalog: src/ui/README.md
 */

// Foundations
export { Icon, ICON_NAMES } from './Icon';
export type { IconName, IconProps } from './Icon';
export { cx, mergeRefs, TONES, isTone, formatNumber, initialsOf, cssVars } from './utils';

// Actions
export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';
export { IconButton } from './IconButton';
export type { IconButtonProps, IconButtonVariant } from './IconButton';
export { PeriodNav } from './PeriodNav';
export type { PeriodNavProps } from './PeriodNav';
export { Menu, Popover } from './Menu';
export type { MenuProps, MenuAction, MenuEntry, PopoverProps } from './Menu';

// Status & labels
export { Badge } from './Badge';
export type { BadgeProps, BadgeTone, SemanticTone, DotShape } from './Badge';
export { StatusPill, BOOKING_STATUS_META } from './StatusPill';
export type { StatusPillProps, BookingStatusMeta } from './StatusPill';
export { Kbd } from './Kbd';
export { Swatch } from './Swatch';
export type { SwatchProps } from './Swatch';

// Containers & navigation
export { Card, CardHeader } from './Card';
export type { CardProps, CardHeaderProps, CardElement } from './Card';
export { Tabs, TabPanel } from './Tabs';
export type { TabsProps, TabItem, TabPanelProps } from './Tabs';
export { Segmented } from './Segmented';
export type { SegmentedProps, SegmentedOption } from './Segmented';

// Forms
export { Field } from './Field';
export type { FieldProps } from './Field';
export { Input } from './Input';
export type { InputProps, ControlSize } from './Input';
export { NumberInput } from './NumberInput';
export type { NumberInputProps } from './NumberInput';
export { Select } from './Select';
export type { SelectProps, SelectOption } from './Select';
export { Textarea } from './Textarea';
export type { TextareaProps } from './Textarea';
export { Checkbox } from './Checkbox';
export type { CheckboxProps } from './Checkbox';
export { Switch } from './Switch';
export type { SwitchProps } from './Switch';
export { RadioCards } from './RadioCards';
export type { RadioCardsProps, RadioCardOption } from './RadioCards';
export { ChoiceChips } from './ChoiceChips';
export type { ChoiceChipsProps, ChoiceOption } from './ChoiceChips';
export { DayStrip } from './DayStrip';
export type { DayStripProps, DayStripItem } from './DayStrip';

// Overlays
export { Dialog } from './Dialog';
export type { DialogProps } from './Dialog';
export { Drawer } from './Drawer';
export type { DrawerProps } from './Drawer';
export { ConfirmDialog } from './ConfirmDialog';
export type { ConfirmDialogProps } from './ConfirmDialog';
export { Portal } from './overlay';

// Feedback
export { Toaster, toast } from './Toast';
export type { ToastOptions, ToastTone } from './Toast';
export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';
export { Skeleton } from './Skeleton';
export type { SkeletonProps } from './Skeleton';
export { Spinner } from './Spinner';
export type { SpinnerProps } from './Spinner';
export { Callout } from './Callout';
export type { CalloutProps, CalloutTone } from './Callout';
export { Banner } from './Banner';
export type { BannerProps } from './Banner';

// Data display
export { Avatar, AvatarStack } from './Avatar';
export type { AvatarProps, AvatarStackProps, AvatarStackPerson, AvatarTone, AvatarSize } from './Avatar';
export { KpiTile } from './KpiTile';
export type { KpiTileProps, KpiDelta } from './KpiTile';
export { Progress } from './Progress';
export type { ProgressProps, ProgressTone } from './Progress';
export { StackedBar } from './StackedBar';
export type { StackedBarProps, StackedSegment, BarTone } from './StackedBar';
export { DescriptionList } from './DescriptionList';
export type { DescriptionListProps, DescriptionItem } from './DescriptionList';
export { Table } from './Table';
export type { TableProps } from './Table';

// Calendar
export { EventBlock, EventStatus, EventChip, EventSeats, EventProgress } from './EventBlock';
export type { EventBlockProps, EventVariant, EventDensity } from './EventBlock';

// Layout
export { AppShell, ShellUser, Wordmark } from './AppShell';
export type { AppShellProps, NavItem, ShellUserProps } from './AppShell';
export { PageHeader, Breadcrumbs } from './PageHeader';
export type { PageHeaderProps, BreadcrumbsProps, Crumb } from './PageHeader';
export { ActionBar } from './ActionBar';
export type { ActionBarProps } from './ActionBar';
