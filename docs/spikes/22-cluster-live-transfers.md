# Live cluster transfers (#22)

Manual real-host validation that two YARK-managed ASA dedicated servers can
share a cluster and complete in-game transfers. The Clusters page still does
**not** probe live transfers — it only checks profile math. This archive is the
operator runbook plus the 2026-08-13 host result.

## Runbook (repeatable)

Use **disposable** profiles, worlds, and a test-owned cluster directory. Do not
point this at a production cluster folder.

1. Create two YARK servers on **different maps**, unique game / query / RCON
   ports, same **Cluster ID** and the same Windows **cluster directory**.
2. Confirm Clusters compliance has no error-severity issues and Launch shows
   `-clusterid=`, `-ClusterDirOverride=`, and `-NoTransferFromFiltering` on both.
3. Start both servers from YARK. Join with a real ASA client.
4. On server A: upload **items** and **dinos** to the transfer terminal; transfer
   the **survivor** to server B.
5. On server B: confirm the survivor arrives and the uploaded items/dinos are
   available at the terminal.
6. **Restart both** dedicated servers from YARK.
7. Join the map where the character remained. Confirm items and dinos are still
   at the terminal.
8. Transfer the survivor back to server A and retrieve the stored objects.

Stop if transfer data looks corrupted; keep the cluster directory and Runtime /
`ShooterGame.log` for diagnosis. Record defects as separate issues.

## Evidence (2026-08-13)

Operator-owned Windows host. Two YARK-managed dedicated servers, shared cluster.
Paths, Cluster ID, map names, YARK/ASA build numbers, and log excerpts were
**not** pasted (redacted / not captured).

| Step | Result |
| --- | --- |
| Upload items and dinos; survivor transfer A → B | OK |
| Restart both servers | OK |
| Rejoin the map where the character stayed; items and dinos still at the terminal | OK |
| Survivor transfer B → A; retrieve stored objects on the original server | OK |

No transfer-data corruption observed. No follow-up defect issues from this run.

## What this does not prove

- Clusters UI is not a live probe (still static `cluster:check` only).
- Mod-item transfers when member `-mods=` lists diverge.
- Tribute INI timers / slot caps ([#325](https://github.com/gabomarin/yark/issues/325)).
- CI / automated game-client transfers.
