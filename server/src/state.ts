import { getUserState, setRenewal, setSwitchKit, switchMoves, type UserRow } from "./db.js";
import { type RenewalInput, renewalCountdown } from "./engine/renewal.js";
import type { SwitchItem } from "./engine/switchkit.js";
import { openForUser, sealForUser } from "./keys.js";

/** Switch kit items and the renewal date are findings, so they are sealed with the user's key like leaks. */

export async function saveSwitchKit(user: UserRow, items: SwitchItem[]): Promise<void> {
  setSwitchKit(user.id, await sealForUser(user.id, user.wrapped_dek, items, "switch_kit"));
}

export async function readSwitchKit(user: UserRow) {
  const row = getUserState(user.id);
  const items = row?.switch_kit_enc ? await openForUser<SwitchItem[]>(user.id, user.wrapped_dek, row.switch_kit_enc, "switch_kit") : [];
  const moved = switchMoves(user.id);
  const withStatus = items.map((i) => ({ ...i, moved: moved.has(i.key), movedAt: moved.get(i.key) ?? null }));
  return {
    items: withStatus,
    moved: withStatus.filter((i) => i.moved).length,
    total: withStatus.length,
    // The first thing still to move, in the safe order (deposits first).
    next: withStatus.find((i) => !i.moved)?.key ?? null,
  };
}

export async function saveRenewal(user: UserRow, input: RenewalInput | null): Promise<void> {
  setRenewal(user.id, input ? await sealForUser(user.id, user.wrapped_dek, input, "renewal") : null);
}

export async function readRenewalInput(user: UserRow): Promise<RenewalInput | null> {
  const row = getUserState(user.id);
  return row?.renewal_enc ? openForUser<RenewalInput>(user.id, user.wrapped_dek, row.renewal_enc, "renewal") : null;
}

export async function readRenewal(user: UserRow, today: string) {
  const input = await readRenewalInput(user);
  return input ? { ...input, ...renewalCountdown(input, today) } : null;
}
