# Proof of Build — IDL (v0.1.0)

- `proof_of_build.json`: IDL, сгенерированный `anchor build` (Anchor 0.31.1)
- `proof_of_build.ts`: TS-типы для `Program<ProofOfBuild>`

```ts
import { Program } from "@coral-xyz/anchor";
import idl from "./proof_of_build.json";
import type { ProofOfBuild } from "./proof_of_build";
const program = new Program<ProofOfBuild>(idl as ProofOfBuild, provider);
```

**Program ID (devnet):** `8GYmgRJ9iRNE9kmBf5HkAfMu23Fdh6ES8XvXMbNdYvJw`

Изменения v0.2 (правила честности, см. главный README):
- `create_hackathon` получил аргумент `registration_end_ts` (не позже `end_ts`);
- `record_fire` получил `pushed_at` и аккаунт `team` (только сервер);
- новые инструкции `disqualify(reason_hash)` и `sweep()` (организатор);
- `set_winners`: 1–3 команды, сумма bps == 10000, у каждой `team.qualified_count > 0`;
- `claim` можно вызывать несколько раз: залог сразу после `finalize`, приз когда он доступен.
  Флаги `participant.refund_claimed` / `prize_claimed` вместо `claimed`;
- новые поля: `hackathon.registration_end_ts`, `hackathon.qualified_count`, `team.qualified_count`,
  `participant.disqualified`, `participant.disqualify_reason`, `fire_record.pushed_at`;
- ошибки 6027–6034 добавлены в конец, старые коды не менялись.

## PDA

| Аккаунт | Seeds |
|---|---|
| Hackathon | `"hackathon"`, organizer, hackathon_id (u64 LE) |
| Vault (token account) | `"vault"`, hackathon |
| Team | `"team"`, hackathon, name (utf-8, ≤ 32 байт) |
| Participant | `"participant"`, hackathon, wallet |
| GithubLink | `"github"`, hackathon, github_id_hash |
| FireRecord | `"fire"`, participant, day_index (u16 LE) |
| Attestation | `"att"`, participant, letter_hash |

## Кто что вызывает

| Инструкция | Откуда |
|---|---|
| `create_hackathon` | фронт, кошелёк организатора; `oracle` = значение из `GET /health` |
| `register_team`, `join_team` | **только через сервер**: он возвращает транзакцию, уже подписанную оракулом |
| `record_fire`, `record_attestation` | только сервер |
| `set_winners` | фронт, организатор, с `end_ts + 3ч` до `+7 дн`; Team-аккаунты победителей в `remainingAccounts` в том же порядке |
| `disqualify` | фронт, организатор, до выбора победителей; затем `POST /participants/:id/disqualification {reason}` |
| `sweep` | фронт, организатор, после `end_ts + 3ч + 30 дн` |
| `finalize` | фронт, кто угодно; `remainingAccounts` = Participant-аккаунты (writable), по ~20 за транзакцию, повторять, пока `status` не станет `finalized` |
| `claim` | фронт, участник; добавить в ту же транзакцию `createAssociatedTokenAccountIdempotent` |

### Регистрация
```ts
const { transaction } = await api.post(`/hackathons/${id}/register-tx`, { teamName });
const tx = Transaction.from(Buffer.from(transaction, "base64"));
const signed = await wallet.signTransaction(tx);        // не пересобирать tx!
await connection.sendRawTransaction(signed.serialize());
```

## Данные для UI
- Огоньки по дням с коммитами и метками: `GET /hackathons/:id/participants`.
- Напрямую из сети: `participant.daysBitmap` (бит i = день i).
