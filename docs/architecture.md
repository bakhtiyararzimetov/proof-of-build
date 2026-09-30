# Architecture

## System Overview

Proof of Build has three parts. The **Solana program** holds all the money and the rules. The **backend** is an oracle that turns GitHub pushes into on-chain fires. The **frontend** is where organizers and participants sign transactions with their own wallets.

```
┌──────────────┐  push   ┌──────────────┐  webhook  ┌───────────────────────┐
│  Participant │───────▶ │    GitHub    │─────────▶ │   Backend (Oracle)    │
│   git push   │         │  (repo + App)│           │  ┌─────────────────┐  │
└──────┬───────┘         └──────────────┘           │  │ HMAC + fraud    │  │
       │ wallet                                     │  │ rules, 1 fire/  │  │
       ▼                                            │  │ day per person  │  │
┌──────────────┐  register / join / claim           │  └────────┬────────┘  │
│   Frontend   │──────────────────────┐             └───────────┼───────────┘
│ React + Vite │                      ▼                         │ record_fire
└──────────────┘            ┌──────────────────────────────────▼─┐
                            │  Solana program: proof_of_build    │
┌──────────────┐ create +   │  Hackathon · Vault · Team ·        │
│  Organizer   │──lock ───▶ │  Participant · Fire · Attestation  │
└──────────────┘  prize     └────────────────────────────────────┘
```

## Components

### Solana Program (`programs/proof_of_build`)
An Anchor program deployed on devnet at `8GYmgRJ9iRNE9kmBf5HkAfMu23Fdh6ES8XvXMbNdYvJw`.

| Instruction | Who calls it | What it does |
|---|---|---|
| `create_hackathon` | Organizer | Creates the hackathon and moves the prize into the vault |
| `register_team` | Captain (+ oracle co-sign) | Creates a team and the captain's participant account, takes the deposit |
| `join_team` | Member (+ oracle co-sign) | Joins a team before registration closes, takes the deposit |
| `record_fire` | Oracle | Records one fire per participant per day, with the commit hash |
| `record_attestation` | Oracle | Stores the hash of a certificate letter |
| `disqualify` | Organizer | Excludes a participant with a reason hash; their deposit goes to the pool |
| `set_winners` | Organizer | 1–3 distinct teams, shares sum to 100%, each with a qualified member |
| `finalize` | Anyone | Settles participants in batches after the end |
| `claim` | Participant | Withdraws refund and prize share; can be called again later |
| `sweep` | Organizer | Takes unclaimed funds 30 days after settlement |

**Accounts (PDAs):**

| Account | Seeds |
|---|---|
| Hackathon | `hackathon, organizer, id` |
| Vault | `vault, hackathon` |
| Team | `team, hackathon, name` |
| Participant | `participant, hackathon, wallet` |
| GitHub link | `github, hackathon, github_id_hash` |
| Fire | `fire, participant, day` |
| Attestation | `att, participant, letter_hash` |

**Timeline (from `end_ts`):** +3 h grace for late webhooks, after which `set_winners` and `finalize` open · +7 days deadline for choosing winners (otherwise qualified participants split the pool equally) · +30 days `sweep`.

Only a salted hash of the GitHub id goes on-chain, never the username.

### Backend / Oracle (`backend/`)
Node.js with Fastify, Prisma and PostgreSQL.

- **GitHub OAuth** to identify users, and **wallet linking** by signing a nonce (tweetnacl).
- **Webhook handler** that verifies the HMAC signature over the raw body, then awards a fire to the pusher (`sender`) only for their own non-merge commit above a minimum size.
- **Fraud rules** that attach flags to participants and teams (see below).
- **Redelivery job** that asks GitHub for failed deliveries at startup and every 15 minutes, so a server restart does not cost anyone a fire.
- **Transaction builder** that partially signs `register_team` / `join_team` with the oracle key, so only GitHub-verified users can join.
- **Certificates**: a letter is rendered, hashed, recorded on-chain and optionally emailed through Resend.

### Frontend (`frontend/`)
React, Vite, TypeScript and Tailwind. It uses Solana Wallet Adapter (Wallet Standard auto-detection) and Anchor in the browser.

- Hackathon list with search and filters, hackathon page with leaderboard, team dashboard, admin panel and certificate verification.
- Every money action (create, register, join, winners, finalize, claim, sweep) is signed by the user's own wallet.
- Installable as a PWA. On mobile browsers without a wallet it offers "Open in Phantom".

## Fraud Flags

| Flag | Trigger |
|---|---|
| `REPO_CREATED_BEFORE_START` | Repository created before the hackathon started |
| `HUGE_COMMIT` | A single commit larger than `HUGE_COMMIT_LINES` |
| `BULK_PUSH` | One push adding more than `BULK_PUSH_LINES` in total |
| `COMMIT_DATE_SKEW` | Commit date differs from push time by more than `COMMIT_SKEW_HOURS` |
| `FORCE_PUSH` | Force-push to an existing branch |
| `AUTHOR_MISMATCH` | A participant's commit was pushed by someone else |
| `NEW_GITHUB_ACCOUNT` | GitHub account younger than `NEW_ACCOUNT_DAYS` |
| `INACTIVE_MEMBER` | Zero own commits while teammates have commits |

Flags do not move money by themselves. They are the evidence for the organizer's on-chain `disqualify`.

## Trust Model

| Actor | Can | Cannot |
|---|---|---|
| Organizer | Choose winners, disqualify before winners are set, sweep after 30 days | Participate, keep part of the prize, take deposits |
| Oracle (backend) | Record fires and attestations, co-sign registrations | Move any tokens |
| Participant | Claim refund and prize share | Earn fires for someone else's commits |
| Anyone | Call `finalize`, verify certificates | — |
