import {
  Baby,
  Briefcase,
  Car,
  Gem,
  GraduationCap,
  Home,
  MapPin,
  PiggyBank,
  Plane,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MILESTONE_ICONS, type MilestoneIcon } from '@/lib/types';

const REGISTRY: Record<MilestoneIcon, LucideIcon> = {
  Home,
  Plane,
  GraduationCap,
  Gem,
  Baby,
  Briefcase,
  PiggyBank,
  Car,
  Sparkles,
};

const LABELS: Record<MilestoneIcon, string> = {
  Home: 'House',
  Plane: 'Travel',
  GraduationCap: 'Education',
  Gem: 'Wedding',
  Baby: 'Family',
  Briefcase: 'Career',
  PiggyBank: 'Savings',
  Car: 'Vehicle',
  Sparkles: 'Other',
};

export function getMilestoneIcon(name: string | undefined | null): LucideIcon {
  if (name && name in REGISTRY) return REGISTRY[name as MilestoneIcon];
  return MapPin;
}

export function getMilestoneIconLabel(name: string | undefined | null): string {
  if (name && name in LABELS) return LABELS[name as MilestoneIcon];
  return 'Generic';
}

export const MILESTONE_ICON_OPTIONS: { value: MilestoneIcon; label: string; Icon: LucideIcon }[] =
  MILESTONE_ICONS.map((value) => ({ value, label: LABELS[value], Icon: REGISTRY[value] }));
