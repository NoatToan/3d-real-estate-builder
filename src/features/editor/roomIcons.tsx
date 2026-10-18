import { Armchair, Bath, BedDouble, Briefcase, Car, CookingPot, Flame, Footprints, Package, Square, Toilet, Trees, Utensils, WashingMachine, type LucideIcon } from "lucide-react";
import type { RoomType } from "@/domain/types";
import { ROOM_TYPE_COLORS, ROOM_TYPE_LABELS } from "@/domain/labels";
import { Text } from "@/components/ui/BasePrimitives";

export const ROOM_TYPE_ICONS: Record<RoomType, LucideIcon> = {
  living: Armchair,
  bedroom: BedDouble,
  kitchen: CookingPot,
  dining: Utensils,
  bathroom: Bath,
  wc: Toilet,
  worship: Flame,
  garage: Car,
  storage: Package,
  balcony: Trees,
  corridor: Footprints,
  office: Briefcase,
  laundry: WashingMachine,
  other: Square,
};

/** Room-type icon on its plan colour, so a type reads at a glance. */
export function RoomTypeBadge({ type, size = 22 }: { type: RoomType; size?: number }) {
  const Icon = ROOM_TYPE_ICONS[type];
  return (
    <Text
      title={ROOM_TYPE_LABELS[type]}
      className="inline-flex shrink-0 items-center justify-center rounded-md border border-black/10 text-ink"
      style={{ width: size, height: size, background: ROOM_TYPE_COLORS[type] }}
    >
      <Icon size={Math.round(size * 0.62)} strokeWidth={2} aria-hidden />
    </Text>
  );
}

/**
 * Bands of a floor layout from the street (left) to the back, coloured by room type with icons:
 * a picture of the template instead of a list of names.
 */
export function ZoneStrip({ zones }: { zones: readonly { name: string; type: RoomType; depth: number; side?: { type: RoomType } }[] }) {
  const fixed = zones.reduce((s, z) => s + Math.max(0, z.depth), 0);
  const flex = zones.filter((z) => z.depth <= 0).length;
  const share = flex ? Math.max(3, fixed / Math.max(1, zones.length - flex)) : 0;
  return (
    <span className="mt-1 flex h-7 w-full overflow-hidden rounded border border-line" aria-hidden>
      {zones.map((z, i) => {
        const Icon = ROOM_TYPE_ICONS[z.type];
        const SideIcon = z.side ? ROOM_TYPE_ICONS[z.side.type] : null;
        return (
          <span key={i} title={z.name} className="flex min-w-0 items-center justify-center gap-0.5 border-r border-white/70 text-ink last:border-r-0" style={{ flex: z.depth > 0 ? z.depth : share, background: ROOM_TYPE_COLORS[z.type] }}>
            <Icon size={13} />
            {SideIcon && <SideIcon size={11} className="opacity-70" />}
          </span>
        );
      })}
    </span>
  );
}
