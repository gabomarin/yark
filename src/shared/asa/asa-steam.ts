/** ASA dedicated server Steam AppID (#458). */
export const ASA_APP_ID = "2430930";

/** steamcmd.net info URL for {@link ASA_APP_ID}. */
export function asaSteamCmdInfoUrl(): string {
  return `https://api.steamcmd.net/v1/info/${ASA_APP_ID}`;
}
