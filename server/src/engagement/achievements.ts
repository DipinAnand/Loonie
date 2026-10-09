export interface BadgeStats {
  savedPerYear: number;
  pluggedCount: number;
  feeFreeDays: number | null;
  huntStreak: number;
  priceHikesReviewed: number;
  suspiciousReviewed: number;
}

export interface BadgeDef {
  id: string;
  title: string;
  description: string;
  earned: (s: BadgeStats) => boolean;
}

export const BADGES: BadgeDef[] = [
  { id: "first_plug", title: "First leak plugged", description: "You stopped your first leak.", earned: (s) => s.pluggedCount >= 1 },
  { id: "saved_100", title: "$100 a year", description: "Plugged leaks worth $100 a year.", earned: (s) => s.savedPerYear >= 100 },
  { id: "saved_500", title: "$500 a year", description: "Plugged leaks worth $500 a year.", earned: (s) => s.savedPerYear >= 500 },
  { id: "saved_1000", title: "$1,000 a year", description: "Plugged leaks worth $1,000 a year.", earned: (s) => s.savedPerYear >= 1000 },
  { id: "fee_free_6m", title: "6 months fee-free", description: "No bank fees for six months.", earned: (s) => (s.feeFreeDays ?? 0) >= 182 },
  { id: "hunt_4", title: "4-week hunter", description: "Four weekly Leak Hunts in a row.", earned: (s) => s.huntStreak >= 4 },
  { id: "hike_spotter", title: "Price-hike spotter", description: "Reviewed a sneaky price increase.", earned: (s) => s.priceHikesReviewed >= 1 },
  { id: "scam_spotter", title: "Scam spotter", description: "Checked a suspicious charge.", earned: (s) => s.suspiciousReviewed >= 1 },
];

export function earnedBadges(stats: BadgeStats): string[] {
  return BADGES.filter((b) => b.earned(stats)).map((b) => b.id);
}
