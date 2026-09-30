# Product

## What is Proof of Build?

Proof of Build is a hackathon platform where the rules are enforced by a Solana program instead of by trust. The organizer locks the prize before the event. Participants prove their work every day with real GitHub commits, which become on-chain "fires". At the end, only people who actually built share the prize and get their deposit back.

## Target Users

- **Hackathon organizers:** universities, communities and companies that want a transparent event and a prize pool nobody can dispute.
- **Builders:** developers, designers and students who want a guarantee that the prize exists and that freeloaders do not share it.
- **Sponsors and judges:** they see who did the work, day by day, and can verify every certificate.

## How It Works

1. **Organizer locks the prize.** USDC goes into a program-owned vault before the start. An optional deposit per member can also be set.
2. **Teams join and connect GitHub.** The captain registers a team and shares an invite code. Registration closes after a set number of hours.
3. **Commit every day.** Each day with your own pushed commit becomes a fire on Solana. Suspicious activity is flagged automatically.
4. **Claim.** Reach the required number of fires to get your deposit back. Winning teams split the prize among members who reached the goal.

## Core Value Propositions

1. **Guaranteed prize.** The money is in the contract before anyone starts working.
2. **Fair split.** A team's share goes only to members who did the work.
3. **Visible cheating.** Old code, backdated commits and fake accounts are flagged.
4. **Organizer cannot run away.** Deposits are refundable without the organizer, and if winners are not chosen within 7 days, qualified participants split the prize.
5. **Verifiable certificates.** The certificate hash is on-chain.

## How It Differs from Typical Hackathon Platforms

| Feature | Typical platform | Proof of Build |
|---------|------------------|----------------|
| Prize guarantee | Organizer's promise | Locked in a program vault |
| Proof of work | Final demo only | Daily on-chain fires from commits |
| Prize split inside a team | Equal, including freeloaders | Only members who reached the goal |
| Anti-cheating | Manual review | 8 automatic flags + on-chain disqualification |
| If the organizer disappears | Nothing happens | Deposits refundable, prize auto-split after 7 days |
| Certificates | Editable PDF | Hash on-chain, public verification |

## Honest Limitations

- **The oracle is centralized.** The backend decides which commit earns a fire. Its key can only record fires and attestations; it can never move funds.
- **One person with several GitHub accounts** counts as several participants. New accounts are flagged, but this cannot be fully prevented.
- **Code quality is not measured.** A fire means "a real commit on that day", not "good code". That is what judges are for.
- Hackathons are limited to 64 days.
