"use client";

import { MorphIcon as BaseMorphIcon, type MorphIconProps } from "morphicons/react";

/**
 * An icon that morphs into the next one when `icon` changes, for buttons whose
 * icon swaps with their state, such as copy turning into a check. It takes
 * icon data from `lucide`, not components from `lucide-react`. The morph
 * follows the OS reduce-motion setting.
 */
export default function MorphIcon({ reducedMotion = "user", ...props }: MorphIconProps) {
  return <BaseMorphIcon reducedMotion={reducedMotion} {...props} />;
}
