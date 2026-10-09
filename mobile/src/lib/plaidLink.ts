import type { LinkExit, LinkSuccess } from "react-native-plaid-link-sdk";

type PlaidSdk = typeof import("react-native-plaid-link-sdk");

let sdk: PlaidSdk | null | undefined;

/**
 * The Plaid Link SDK is a native module: it exists in a development build
 * (`npx expo run:ios|android`) but not in Expo Go or on web. Load it lazily so
 * the rest of the app still runs there (use the sandbox quick-link instead).
 */
function loadSdk(): PlaidSdk | null {
  if (sdk === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      sdk = require("react-native-plaid-link-sdk") as PlaidSdk;
    } catch {
      sdk = null;
    }
  }
  return sdk;
}

export function isPlaidLinkAvailable(): boolean {
  return loadSdk() !== null;
}

export type LinkOutcome = { type: "success"; success: LinkSuccess } | { type: "exit"; exit: LinkExit };

/** Opens Plaid Link and resolves when the user finishes or backs out. */
export async function openPlaidLink(linkToken: string): Promise<LinkOutcome> {
  const plaid = loadSdk();
  if (!plaid) throw new Error("Plaid Link needs a development build (npx expo run:ios / run:android).");

  return new Promise<LinkOutcome>((resolve, reject) => {
    plaid
      .createPlaidLinkSession({
        token: linkToken,
        onSuccess: (success) => resolve({ type: "success", success }),
        onExit: (exit) => resolve({ type: "exit", exit }),
        onEvent: () => {},
      })
      .then((session) => session.open(false))
      .catch(reject);
  });
}
