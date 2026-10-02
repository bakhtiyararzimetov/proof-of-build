# API Reference

Base URL: `http://localhost:3000` locally. Authenticated routes need `Authorization: Bearer <JWT>`, which the backend issues after GitHub sign-in.

## Endpoints

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/health` | public | Status and oracle public key |
| GET | `/auth/github` | public | Starts GitHub sign-in |
| GET | `/auth/github/callback` | public | Redirects to `FRONTEND_URL/auth/callback#token=<JWT>` |
| GET | `/me` | JWT | Profile, linked wallet, participations, organized hackathons |
| POST | `/auth/wallet/nonce` | JWT | Message to sign for wallet linking |
| POST | `/auth/wallet` | JWT | Links the wallet after verifying the signature |
| GET | `/hackathons` | public | List of hackathons |
| POST | `/hackathons` | JWT, organizer wallet | Registers an on-chain hackathon with a title and description |
| GET | `/hackathons/:id` | public | On-chain state, timeline and teams |
| GET | `/hackathons/:id/participants` | public | Participants with daily fires, flags and payout status |
| POST | `/hackathons/:id/register-tx` | JWT + wallet | Oracle-co-signed `register_team` transaction |
| POST | `/hackathons/:id/join-tx` | JWT + wallet | Oracle-co-signed `join_team` transaction |
| GET | `/teams/:id` | public | Team, members and repositories |
| POST | `/teams/:id/repos` | JWT, captain | Connects a repository with the GitHub App installed |
| POST | `/teams/:id/invite` | JWT, captain | Rotates the invite code |
| GET | `/teams/:id/commits` | public | Commits with fire status and flags |
| POST | `/participants/:id/disqualification` | JWT, organizer | Stores the reason text after an on-chain `disqualify` |
| POST | `/webhooks/github` | HMAC signature | GitHub push events |
| POST | `/attestations` | JWT, participant or organizer | Issues a certificate after the end (one per participant) |
| GET | `/verify/:hash` | public | Verifies a certificate hash |
| POST | `/faucet` | JWT + wallet | Sends 1000 devnet test USDC for a hackathon whose mint the oracle controls |

## Examples

### Link a wallet
```
POST /auth/wallet/nonce
{ "wallet": "24nMnciyx6mrQy2ETzFjimk113QBp5DCSHELv8jG1uuG" }
```
```json
{ "nonce": "…", "message": "Proof of Build: link this wallet to a GitHub account.\nWallet: …\nGitHub: …\nNonce: …" }
```
Sign `message` with the wallet, then:
```
POST /auth/wallet
{ "wallet": "24nM…", "nonce": "…", "signature": "<base58>" }
```

### Register a team
```
POST /hackathons/:id/register-tx
{ "teamName": "Alpha" }
```
```json
{ "transaction": "<base64, partially signed by the oracle>", "team": "<team PDA>", "participant": "<participant PDA>", "inviteCode": "Xk3-9fQa" }
```
The captain signs the transaction with their wallet and sends it. Members then call `/hackathons/:id/join-tx` with `{ "inviteCode": "Xk3-9fQa" }`.

### Connect a repository
```
POST /teams/:id/repos
{ "fullName": "team-alpha/project" }
```

### Health
```
GET /health
```
```json
{ "ok": true, "oracle": "EAcjKySSkPP1UsYMgMhHrKNeWKba5tmLS9bhKH9mJNzp" }
```

## Full Flow

1. `GET /auth/github` → token.
2. Link the wallet (`/auth/wallet/nonce` → sign → `/auth/wallet`).
3. Captain: `register-tx` → sign → send → share the invite code.
4. Members: `join-tx` → sign → send.
5. Captain installs the GitHub App and calls `POST /teams/:id/repos`.
6. Every push → webhook → `record_fire` (at most one fire per participant per day).
7. After the end: organizer `set_winners`, anyone `finalize`, participants `claim`.
8. `POST /attestations` → letter + on-chain hash → `GET /verify/:hash`.
