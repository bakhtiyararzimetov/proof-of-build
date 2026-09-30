use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("8GYmgRJ9iRNE9kmBf5HkAfMu23Fdh6ES8XvXMbNdYvJw");

pub const SECONDS_PER_DAY: i64 = 86_400;
pub const MAX_DAYS: i64 = 64; // days_bitmap is u64
pub const MAX_MEMBERS: usize = 5;
pub const MAX_WINNERS: usize = 3;
pub const MAX_NAME_LEN: usize = 32;
pub const BPS_DENOMINATOR: u64 = 10_000;

/// A push is accepted this long after it happened (webhook delays, server restarts, redelivery).
/// Settlement (set_winners / finalize) starts only after end_ts + FIRE_GRACE, so no fire can land after it.
pub const FIRE_GRACE: i64 = 3 * 3_600;
/// The organizer must pick winners within this period after settlement starts; otherwise
/// the prize is split equally between all qualified participants.
pub const WINNERS_DEADLINE: i64 = 7 * SECONDS_PER_DAY;
/// After this period after settlement starts the organizer may sweep what nobody claimed
/// (rounding dust, unclaimed payouts, the pool when nobody qualified).
pub const CLAIM_WINDOW: i64 = 30 * SECONDS_PER_DAY;

pub const HACKATHON_SEED: &[u8] = b"hackathon";
pub const VAULT_SEED: &[u8] = b"vault";
pub const TEAM_SEED: &[u8] = b"team";
pub const PARTICIPANT_SEED: &[u8] = b"participant";
pub const GITHUB_SEED: &[u8] = b"github";
pub const FIRE_SEED: &[u8] = b"fire";
pub const ATTESTATION_SEED: &[u8] = b"att";

#[program]
pub mod proof_of_build {
    use super::*;

    #[allow(clippy::too_many_arguments)]
    pub fn create_hackathon(
        ctx: Context<CreateHackathon>,
        hackathon_id: u64,
        oracle: Pubkey,
        start_ts: i64,
        end_ts: i64,
        registration_end_ts: i64,
        deposit_amount: u64,
        required_fires: u16,
        prize_amount: u64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(start_ts < end_ts && end_ts > now, PobError::InvalidTimeRange);
        require!(
            registration_end_ts > now && registration_end_ts <= end_ts,
            PobError::InvalidTimeRange
        );
        let duration = end_ts.checked_sub(start_ts).ok_or(PobError::MathOverflow)?;
        let max_duration = MAX_DAYS
            .checked_mul(SECONDS_PER_DAY)
            .ok_or(PobError::MathOverflow)?;
        require!(duration <= max_duration, PobError::InvalidTimeRange);
        let days = duration
            .checked_add(SECONDS_PER_DAY - 1)
            .ok_or(PobError::MathOverflow)?
            / SECONDS_PER_DAY;
        require!(
            required_fires > 0 && i64::from(required_fires) <= days,
            PobError::InvalidRequiredFires
        );
        require!(prize_amount > 0, PobError::ZeroPrize);

        let h = &mut ctx.accounts.hackathon;
        h.organizer = ctx.accounts.organizer.key();
        h.oracle = oracle;
        h.mint = ctx.accounts.mint.key();
        h.vault = ctx.accounts.vault.key();
        h.hackathon_id = hackathon_id;
        h.start_ts = start_ts;
        h.end_ts = end_ts;
        h.registration_end_ts = registration_end_ts;
        h.deposit_amount = deposit_amount;
        h.required_fires = required_fires;
        h.prize_pool = prize_amount;
        h.team_count = 0;
        h.participant_count = 0;
        h.settled_count = 0;
        h.qualified_count = 0;
        h.status = HackathonStatus::Active;
        h.winners_set = false;
        h.winner_count = 0;
        h.winners = [Winner::default(); MAX_WINNERS];
        h.bump = ctx.bumps.hackathon;
        h.vault_bump = ctx.bumps.vault;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.organizer_token.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.organizer.to_account_info(),
                },
            ),
            prize_amount,
        )
    }

    pub fn register_team(
        ctx: Context<RegisterTeam>,
        name: String,
        github_id_hash: [u8; 32],
    ) -> Result<()> {
        let hackathon_key = ctx.accounts.hackathon.key();
        let wallet = ctx.accounts.wallet.key();
        let team_key = ctx.accounts.team.key();

        let team = &mut ctx.accounts.team;
        team.hackathon = hackathon_key;
        team.name = name;
        team.captain = wallet;
        team.members = vec![wallet];
        team.qualified_count = 0;
        team.bump = ctx.bumps.team;

        let h = &mut ctx.accounts.hackathon;
        h.team_count = h.team_count.checked_add(1).ok_or(PobError::MathOverflow)?;

        emit!(TeamRegistered {
            hackathon: hackathon_key,
            team: team_key,
            captain: wallet,
        });

        add_participant(
            &mut ctx.accounts.hackathon,
            &mut ctx.accounts.participant,
            &mut ctx.accounts.github_link,
            team_key,
            &ctx.accounts.wallet,
            github_id_hash,
            ctx.bumps.participant,
            ctx.bumps.github_link,
            ctx.accounts.wallet_token.as_ref(),
            &ctx.accounts.vault,
            &ctx.accounts.token_program,
        )
    }

    pub fn join_team(ctx: Context<JoinTeam>, github_id_hash: [u8; 32]) -> Result<()> {
        let wallet = ctx.accounts.wallet.key();
        let team = &mut ctx.accounts.team;
        require!(team.members.len() < MAX_MEMBERS, PobError::TeamFull);
        team.members.push(wallet);
        let team_key = team.key();

        add_participant(
            &mut ctx.accounts.hackathon,
            &mut ctx.accounts.participant,
            &mut ctx.accounts.github_link,
            team_key,
            &ctx.accounts.wallet,
            github_id_hash,
            ctx.bumps.participant,
            ctx.bumps.github_link,
            ctx.accounts.wallet_token.as_ref(),
            &ctx.accounts.vault,
            &ctx.accounts.token_program,
        )
    }

    /// `pushed_at` is GitHub's push time (repository.pushed_at). The day is derived from it,
    /// so a webhook that arrives late (up to FIRE_GRACE) still lands on the right day.
    pub fn record_fire(
        ctx: Context<RecordFire>,
        day_index: u16,
        commit_hash: [u8; 20],
        pushed_at: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let h = &mut ctx.accounts.hackathon;
        let p = &mut ctx.accounts.participant;
        require!(!p.disqualified, PobError::Disqualified);
        require!(pushed_at >= h.start_ts, PobError::HackathonNotStarted);
        require!(pushed_at < h.end_ts, PobError::HackathonEnded);
        require!(pushed_at <= now, PobError::InvalidPushTime);
        let delay = now.checked_sub(pushed_at).ok_or(PobError::MathOverflow)?;
        require!(delay <= FIRE_GRACE, PobError::FireTooLate);
        let push_day = pushed_at
            .checked_sub(h.start_ts)
            .ok_or(PobError::MathOverflow)?
            / SECONDS_PER_DAY;
        require!(push_day == i64::from(day_index), PobError::WrongDayIndex);
        require!(i64::from(day_index) < MAX_DAYS, PobError::WrongDayIndex);

        let bit = 1u64 << day_index;
        // The PDA already prevents a second record for the same day; this is a second guard.
        require!(p.days_bitmap & bit == 0, PobError::DayAlreadyRecorded);
        p.days_bitmap |= bit;
        p.fires = p.fires.checked_add(1).ok_or(PobError::MathOverflow)?;

        if p.fires == h.required_fires {
            let team = &mut ctx.accounts.team;
            team.qualified_count = team
                .qualified_count
                .checked_add(1)
                .ok_or(PobError::MathOverflow)?;
            h.qualified_count = h
                .qualified_count
                .checked_add(1)
                .ok_or(PobError::MathOverflow)?;
        }

        let fire = &mut ctx.accounts.fire_record;
        fire.participant = p.key();
        fire.day_index = day_index;
        fire.commit_hash = commit_hash;
        fire.pushed_at = pushed_at;
        fire.recorded_at = now;
        fire.bump = ctx.bumps.fire_record;

        emit!(FireRecorded {
            hackathon: h.key(),
            participant: p.key(),
            day_index,
            commit_hash,
            fires: p.fires,
        });
        Ok(())
    }

    pub fn record_attestation(ctx: Context<RecordAttestation>, letter_hash: [u8; 32]) -> Result<()> {
        let att = &mut ctx.accounts.attestation;
        att.participant = ctx.accounts.participant.key();
        att.letter_hash = letter_hash;
        att.created_at = Clock::get()?.unix_timestamp;
        att.bump = ctx.bumps.attestation;
        emit!(AttestationRecorded {
            participant: att.participant,
            letter_hash,
        });
        Ok(())
    }

    /// Organizer excludes a cheater. The deposit is forfeited to the prize pool (never to the
    /// organizer) and the participant gets no prize. Only before winners are set and before the
    /// participant is settled, so payouts computed later cannot change.
    pub fn disqualify(ctx: Context<Disqualify>, reason_hash: [u8; 32]) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let h = &mut ctx.accounts.hackathon;
        require!(now >= h.start_ts, PobError::HackathonNotStarted);
        require!(!h.winners_set, PobError::WinnersAlreadySet);
        require!(now < winners_deadline(h)?, PobError::WinnersDeadlinePassed);

        let p = &mut ctx.accounts.participant;
        require!(!p.settled, PobError::AlreadySettled);
        require!(!p.disqualified, PobError::AlreadyDisqualified);

        if p.fires >= h.required_fires {
            let team = &mut ctx.accounts.team;
            team.qualified_count = team
                .qualified_count
                .checked_sub(1)
                .ok_or(PobError::MathOverflow)?;
            h.qualified_count = h
                .qualified_count
                .checked_sub(1)
                .ok_or(PobError::MathOverflow)?;
        }
        p.disqualified = true;
        p.disqualify_reason = reason_hash;

        emit!(ParticipantDisqualified {
            hackathon: h.key(),
            participant: p.key(),
            reason_hash,
        });
        Ok(())
    }

    pub fn set_winners<'info>(
        ctx: Context<'_, '_, 'info, 'info, SetWinners<'info>>,
        winners: Vec<WinnerInput>,
    ) -> Result<()> {
        let hackathon_key = ctx.accounts.hackathon.key();
        let h = &mut ctx.accounts.hackathon;
        let now = Clock::get()?.unix_timestamp;
        require!(now >= settlement_start(h)?, PobError::HackathonNotEnded);
        require!(now < winners_deadline(h)?, PobError::WinnersDeadlinePassed);
        require!(!h.winners_set, PobError::WinnersAlreadySet);
        require!(
            !winners.is_empty() && winners.len() <= MAX_WINNERS,
            PobError::InvalidWinners
        );
        require!(
            ctx.remaining_accounts.len() == winners.len(),
            PobError::InvalidWinners
        );

        let mut total_bps: u64 = 0;
        for (i, w) in winners.iter().enumerate() {
            require!(w.bps > 0, PobError::InvalidWinners);
            require!(
                winners[..i].iter().all(|prev| prev.team != w.team),
                PobError::InvalidWinners
            );
            total_bps = total_bps
                .checked_add(u64::from(w.bps))
                .ok_or(PobError::MathOverflow)?;

            let info = &ctx.remaining_accounts[i];
            require_keys_eq!(info.key(), w.team, PobError::WinnerTeamMismatch);
            let team = Account::<Team>::try_from(info)?;
            require_keys_eq!(team.hackathon, hackathon_key, PobError::WinnerTeamMismatch);
            // A team nobody in which met the goal cannot win: its share would be unclaimable
            // and end up back with the organizer through sweep.
            require!(team.qualified_count > 0, PobError::TeamNotQualified);
        }
        // The whole pool must be distributed, otherwise the organizer could keep the rest.
        require!(total_bps == BPS_DENOMINATOR, PobError::InvalidWinners);

        for (i, w) in winners.iter().enumerate() {
            h.winners[i] = Winner {
                team: w.team,
                bps: w.bps,
            };
        }
        h.winner_count = winners.len() as u8;
        h.winners_set = true;

        emit!(WinnersSet {
            hackathon: hackathon_key,
            winners: h.winners[..winners.len()].to_vec(),
        });
        Ok(())
    }

    pub fn finalize<'info>(ctx: Context<'_, '_, 'info, 'info, Finalize<'info>>) -> Result<()> {
        let hackathon_key = ctx.accounts.hackathon.key();
        let h = &mut ctx.accounts.hackathon;
        require!(
            Clock::get()?.unix_timestamp >= settlement_start(h)?,
            PobError::HackathonNotEnded
        );
        require!(h.status == HackathonStatus::Active, PobError::AlreadyFinalized);

        for info in ctx.remaining_accounts.iter() {
            require!(info.is_writable, PobError::AccountNotWritable);
            let mut p = Account::<Participant>::try_from(info)?;
            require_keys_eq!(p.hackathon, hackathon_key, PobError::WrongHackathon);
            // Skipped rather than rejected so that parallel crank batches do not fail.
            if p.settled {
                continue;
            }
            p.settled = true;
            if p.deposit_paid && !is_qualified(&p, h) {
                h.prize_pool = h
                    .prize_pool
                    .checked_add(h.deposit_amount)
                    .ok_or(PobError::MathOverflow)?;
            }
            h.settled_count = h.settled_count.checked_add(1).ok_or(PobError::MathOverflow)?;
            p.exit(&crate::ID)?;
        }

        if h.settled_count == h.participant_count {
            h.status = HackathonStatus::Finalized;
            emit!(HackathonFinalized {
                hackathon: hackathon_key,
                prize_pool: h.prize_pool,
            });
        }
        Ok(())
    }

    /// Pays whatever is available now; can be called again later for the rest
    /// (e.g. the deposit right after finalize, the prize once winners are known).
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let h = &ctx.accounts.hackathon;
        require!(h.status == HackathonStatus::Finalized, PobError::NotFinalized);

        let team = &ctx.accounts.team;
        let p = &mut ctx.accounts.participant;
        let qualified = is_qualified(p, h);

        let deposit_refund = if qualified && p.deposit_paid && !p.refund_claimed {
            h.deposit_amount
        } else {
            0
        };

        let mut prize_share: u64 = 0;
        if qualified && !p.prize_claimed {
            let share: u128 = if h.winners_set {
                match h.winners[..h.winner_count as usize]
                    .iter()
                    .find(|w| w.team == team.key())
                {
                    Some(w) if team.qualified_count > 0 => (h.prize_pool as u128)
                        .checked_mul(w.bps as u128)
                        .ok_or(PobError::MathOverflow)?
                        / (BPS_DENOMINATOR as u128)
                        / (team.qualified_count as u128),
                    _ => 0,
                }
            } else if now >= winners_deadline(h)? && h.qualified_count > 0 {
                // The organizer missed the deadline: everyone who met the goal shares the pool.
                (h.prize_pool as u128) / (h.qualified_count as u128)
            } else {
                0
            };
            prize_share = u64::try_from(share).map_err(|_| PobError::MathOverflow)?;
        }

        let total = deposit_refund
            .checked_add(prize_share)
            .ok_or(PobError::MathOverflow)?;
        require!(total > 0, PobError::NothingToClaim);
        if deposit_refund > 0 {
            p.refund_claimed = true;
        }
        if prize_share > 0 {
            p.prize_claimed = true;
        }

        let id_bytes = h.hackathon_id.to_le_bytes();
        let seeds: &[&[u8]] = &[HACKATHON_SEED, h.organizer.as_ref(), &id_bytes, &[h.bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.wallet_token.to_account_info(),
                    authority: ctx.accounts.hackathon.to_account_info(),
                },
                &[seeds],
            ),
            total,
        )?;

        emit!(Claimed {
            participant: ctx.accounts.participant.key(),
            deposit_refund,
            prize_share,
        });
        Ok(())
    }

    /// After the claim window the organizer takes back what nobody claimed.
    pub fn sweep(ctx: Context<Sweep>) -> Result<()> {
        let h = &ctx.accounts.hackathon;
        require!(h.status == HackathonStatus::Finalized, PobError::NotFinalized);
        let open_until = settlement_start(h)?
            .checked_add(CLAIM_WINDOW)
            .ok_or(PobError::MathOverflow)?;
        require!(
            Clock::get()?.unix_timestamp >= open_until,
            PobError::ClaimWindowOpen
        );
        let amount = ctx.accounts.vault.amount;
        require!(amount > 0, PobError::NothingToClaim);

        let id_bytes = h.hackathon_id.to_le_bytes();
        let seeds: &[&[u8]] = &[HACKATHON_SEED, h.organizer.as_ref(), &id_bytes, &[h.bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.organizer_token.to_account_info(),
                    authority: ctx.accounts.hackathon.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;
        emit!(Swept {
            hackathon: h.key(),
            amount,
        });
        Ok(())
    }
}

fn is_qualified(p: &Participant, h: &Hackathon) -> bool {
    !p.disqualified && p.fires >= h.required_fires
}

fn settlement_start(h: &Hackathon) -> Result<i64> {
    Ok(h.end_ts.checked_add(FIRE_GRACE).ok_or(PobError::MathOverflow)?)
}

fn winners_deadline(h: &Hackathon) -> Result<i64> {
    Ok(settlement_start(h)?
        .checked_add(WINNERS_DEADLINE)
        .ok_or(PobError::MathOverflow)?)
}

#[allow(clippy::too_many_arguments)]
fn add_participant<'info>(
    hackathon: &mut Account<'info, Hackathon>,
    participant: &mut Account<'info, Participant>,
    github_link: &mut Account<'info, GithubLink>,
    team: Pubkey,
    wallet: &Signer<'info>,
    github_id_hash: [u8; 32],
    participant_bump: u8,
    github_link_bump: u8,
    wallet_token: Option<&Account<'info, TokenAccount>>,
    vault: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
) -> Result<()> {
    require!(
        Clock::get()?.unix_timestamp < hackathon.registration_end_ts,
        PobError::RegistrationClosed
    );
    // The organizer picks winners, so the organizer cannot be one.
    require_keys_neq!(
        wallet.key(),
        hackathon.organizer,
        PobError::OrganizerCannotParticipate
    );

    participant.hackathon = hackathon.key();
    participant.team = team;
    participant.wallet = wallet.key();
    participant.github_id_hash = github_id_hash;
    participant.fires = 0;
    participant.days_bitmap = 0;
    participant.disqualified = false;
    participant.disqualify_reason = [0; 32];
    participant.settled = false;
    participant.refund_claimed = false;
    participant.prize_claimed = false;
    participant.bump = participant_bump;

    github_link.hackathon = hackathon.key();
    github_link.participant = participant.key();
    github_link.bump = github_link_bump;

    hackathon.participant_count = hackathon
        .participant_count
        .checked_add(1)
        .ok_or(PobError::MathOverflow)?;

    if hackathon.deposit_amount > 0 {
        let from = wallet_token.ok_or(PobError::DepositAccountMissing)?;
        token::transfer(
            CpiContext::new(
                token_program.to_account_info(),
                Transfer {
                    from: from.to_account_info(),
                    to: vault.to_account_info(),
                    authority: wallet.to_account_info(),
                },
            ),
            hackathon.deposit_amount,
        )?;
        participant.deposit_paid = true;
    } else {
        participant.deposit_paid = false;
    }

    emit!(ParticipantJoined {
        hackathon: hackathon.key(),
        team,
        participant: participant.key(),
        wallet: wallet.key(),
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// Accounts contexts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(hackathon_id: u64)]
pub struct CreateHackathon<'info> {
    #[account(mut)]
    pub organizer: Signer<'info>,
    #[account(
        init,
        payer = organizer,
        space = 8 + Hackathon::INIT_SPACE,
        seeds = [HACKATHON_SEED, organizer.key().as_ref(), &hackathon_id.to_le_bytes()],
        bump
    )]
    pub hackathon: Account<'info, Hackathon>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = organizer,
        seeds = [VAULT_SEED, hackathon.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = hackathon
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = organizer)]
    pub organizer_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(name: String, github_id_hash: [u8; 32])]
pub struct RegisterTeam<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    pub oracle: Signer<'info>,
    #[account(mut, has_one = oracle @ PobError::UnauthorizedOracle)]
    pub hackathon: Account<'info, Hackathon>,
    #[account(
        init,
        payer = wallet,
        space = 8 + Team::INIT_SPACE,
        seeds = [TEAM_SEED, hackathon.key().as_ref(), name.as_bytes()],
        bump,
        constraint = !name.is_empty() && name.len() <= MAX_NAME_LEN @ PobError::NameTooLong
    )]
    pub team: Account<'info, Team>,
    #[account(
        init,
        payer = wallet,
        space = 8 + Participant::INIT_SPACE,
        seeds = [PARTICIPANT_SEED, hackathon.key().as_ref(), wallet.key().as_ref()],
        bump
    )]
    pub participant: Account<'info, Participant>,
    #[account(
        init,
        payer = wallet,
        space = 8 + GithubLink::INIT_SPACE,
        seeds = [GITHUB_SEED, hackathon.key().as_ref(), github_id_hash.as_ref()],
        bump
    )]
    pub github_link: Account<'info, GithubLink>,
    #[account(address = hackathon.mint)]
    pub mint: Account<'info, Mint>,
    #[account(mut, seeds = [VAULT_SEED, hackathon.key().as_ref()], bump = hackathon.vault_bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = wallet)]
    pub wallet_token: Option<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(github_id_hash: [u8; 32])]
pub struct JoinTeam<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    pub oracle: Signer<'info>,
    #[account(mut, has_one = oracle @ PobError::UnauthorizedOracle)]
    pub hackathon: Account<'info, Hackathon>,
    #[account(mut, has_one = hackathon @ PobError::WrongHackathon)]
    pub team: Account<'info, Team>,
    #[account(
        init,
        payer = wallet,
        space = 8 + Participant::INIT_SPACE,
        seeds = [PARTICIPANT_SEED, hackathon.key().as_ref(), wallet.key().as_ref()],
        bump
    )]
    pub participant: Account<'info, Participant>,
    #[account(
        init,
        payer = wallet,
        space = 8 + GithubLink::INIT_SPACE,
        seeds = [GITHUB_SEED, hackathon.key().as_ref(), github_id_hash.as_ref()],
        bump
    )]
    pub github_link: Account<'info, GithubLink>,
    #[account(address = hackathon.mint)]
    pub mint: Account<'info, Mint>,
    #[account(mut, seeds = [VAULT_SEED, hackathon.key().as_ref()], bump = hackathon.vault_bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = wallet)]
    pub wallet_token: Option<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(day_index: u16)]
pub struct RecordFire<'info> {
    #[account(mut)]
    pub oracle: Signer<'info>,
    #[account(mut, has_one = oracle @ PobError::UnauthorizedOracle)]
    pub hackathon: Account<'info, Hackathon>,
    #[account(mut, has_one = hackathon @ PobError::WrongHackathon)]
    pub participant: Account<'info, Participant>,
    #[account(mut, address = participant.team @ PobError::NotTeamMember)]
    pub team: Account<'info, Team>,
    #[account(
        init,
        payer = oracle,
        space = 8 + FireRecord::INIT_SPACE,
        seeds = [FIRE_SEED, participant.key().as_ref(), &day_index.to_le_bytes()],
        bump
    )]
    pub fire_record: Account<'info, FireRecord>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(letter_hash: [u8; 32])]
pub struct RecordAttestation<'info> {
    #[account(mut)]
    pub oracle: Signer<'info>,
    #[account(has_one = oracle @ PobError::UnauthorizedOracle)]
    pub hackathon: Account<'info, Hackathon>,
    #[account(has_one = hackathon @ PobError::WrongHackathon)]
    pub participant: Account<'info, Participant>,
    #[account(
        init,
        payer = oracle,
        space = 8 + Attestation::INIT_SPACE,
        seeds = [ATTESTATION_SEED, participant.key().as_ref(), letter_hash.as_ref()],
        bump
    )]
    pub attestation: Account<'info, Attestation>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Disqualify<'info> {
    pub organizer: Signer<'info>,
    #[account(mut, has_one = organizer @ PobError::UnauthorizedOrganizer)]
    pub hackathon: Account<'info, Hackathon>,
    #[account(mut, has_one = hackathon @ PobError::WrongHackathon)]
    pub participant: Account<'info, Participant>,
    #[account(mut, address = participant.team @ PobError::NotTeamMember)]
    pub team: Account<'info, Team>,
}

#[derive(Accounts)]
pub struct SetWinners<'info> {
    pub organizer: Signer<'info>,
    #[account(mut, has_one = organizer @ PobError::UnauthorizedOrganizer)]
    pub hackathon: Account<'info, Hackathon>,
}

#[derive(Accounts)]
pub struct Finalize<'info> {
    pub cranker: Signer<'info>,
    #[account(mut)]
    pub hackathon: Account<'info, Hackathon>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    pub wallet: Signer<'info>,
    pub hackathon: Account<'info, Hackathon>,
    #[account(has_one = hackathon @ PobError::WrongHackathon)]
    pub team: Account<'info, Team>,
    #[account(
        mut,
        seeds = [PARTICIPANT_SEED, hackathon.key().as_ref(), wallet.key().as_ref()],
        bump = participant.bump,
        has_one = wallet,
        has_one = team @ PobError::NotTeamMember
    )]
    pub participant: Account<'info, Participant>,
    #[account(address = hackathon.mint)]
    pub mint: Account<'info, Mint>,
    #[account(mut, seeds = [VAULT_SEED, hackathon.key().as_ref()], bump = hackathon.vault_bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = wallet)]
    pub wallet_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Sweep<'info> {
    pub organizer: Signer<'info>,
    #[account(has_one = organizer @ PobError::UnauthorizedOrganizer)]
    pub hackathon: Account<'info, Hackathon>,
    #[account(address = hackathon.mint)]
    pub mint: Account<'info, Mint>,
    #[account(mut, seeds = [VAULT_SEED, hackathon.key().as_ref()], bump = hackathon.vault_bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = organizer)]
    pub organizer_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum HackathonStatus {
    Active,
    Finalized,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct Winner {
    pub team: Pubkey,
    pub bps: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct WinnerInput {
    pub team: Pubkey,
    pub bps: u16,
}

#[account]
#[derive(InitSpace)]
pub struct Hackathon {
    pub organizer: Pubkey,
    pub oracle: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub hackathon_id: u64,
    pub start_ts: i64,
    pub end_ts: i64,
    pub registration_end_ts: i64,
    pub deposit_amount: u64,
    pub required_fires: u16,
    /// Prizes + forfeited deposits (grows during finalize).
    pub prize_pool: u64,
    pub team_count: u32,
    pub participant_count: u32,
    pub settled_count: u32,
    /// Participants with fires >= required_fires who are not disqualified.
    pub qualified_count: u32,
    pub status: HackathonStatus,
    pub winners_set: bool,
    pub winner_count: u8,
    pub winners: [Winner; MAX_WINNERS],
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Team {
    pub hackathon: Pubkey,
    #[max_len(MAX_NAME_LEN)]
    pub name: String,
    pub captain: Pubkey,
    #[max_len(MAX_MEMBERS)]
    pub members: Vec<Pubkey>,
    /// Members who met the goal; the team's prize share is split between them only.
    pub qualified_count: u8,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Participant {
    pub hackathon: Pubkey,
    pub team: Pubkey,
    pub wallet: Pubkey,
    pub github_id_hash: [u8; 32],
    pub fires: u16,
    /// Bit i = a fire on day i.
    pub days_bitmap: u64,
    pub deposit_paid: bool,
    pub disqualified: bool,
    /// SHA-256 of the organizer's reason text (the text itself is off-chain).
    pub disqualify_reason: [u8; 32],
    pub settled: bool,
    pub refund_claimed: bool,
    pub prize_claimed: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct GithubLink {
    pub hackathon: Pubkey,
    pub participant: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct FireRecord {
    pub participant: Pubkey,
    pub day_index: u16,
    pub commit_hash: [u8; 20],
    /// GitHub's push time
    pub pushed_at: i64,
    /// On-chain time the fire was recorded
    pub recorded_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Attestation {
    pub participant: Pubkey,
    pub letter_hash: [u8; 32],
    pub created_at: i64,
    pub bump: u8,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[event]
pub struct TeamRegistered {
    pub hackathon: Pubkey,
    pub team: Pubkey,
    pub captain: Pubkey,
}

#[event]
pub struct ParticipantJoined {
    pub hackathon: Pubkey,
    pub team: Pubkey,
    pub participant: Pubkey,
    pub wallet: Pubkey,
}

#[event]
pub struct FireRecorded {
    pub hackathon: Pubkey,
    pub participant: Pubkey,
    pub day_index: u16,
    pub commit_hash: [u8; 20],
    pub fires: u16,
}

#[event]
pub struct AttestationRecorded {
    pub participant: Pubkey,
    pub letter_hash: [u8; 32],
}

#[event]
pub struct ParticipantDisqualified {
    pub hackathon: Pubkey,
    pub participant: Pubkey,
    pub reason_hash: [u8; 32],
}

#[event]
pub struct WinnersSet {
    pub hackathon: Pubkey,
    pub winners: Vec<Winner>,
}

#[event]
pub struct HackathonFinalized {
    pub hackathon: Pubkey,
    pub prize_pool: u64,
}

#[event]
pub struct Claimed {
    pub participant: Pubkey,
    pub deposit_refund: u64,
    pub prize_share: u64,
}

#[event]
pub struct Swept {
    pub hackathon: Pubkey,
    pub amount: u64,
}

// ---------------------------------------------------------------------------
// Errors (codes start at 6000; append only, never reorder)
// ---------------------------------------------------------------------------

#[error_code]
pub enum PobError {
    #[msg("Invalid time range: start < end, end in the future, registration end in (now, end], duration <= 64 days")]
    InvalidTimeRange,
    #[msg("required_fires must be between 1 and the number of days")]
    InvalidRequiredFires,
    #[msg("prize_amount must be > 0")]
    ZeroPrize,
    #[msg("Team name must be 1..=32 bytes")]
    NameTooLong,
    #[msg("Registration is closed")]
    RegistrationClosed,
    #[msg("The team already has 5 members")]
    TeamFull,
    #[msg("wallet_token is required when deposit_amount > 0")]
    DepositAccountMissing,
    #[msg("The signer is not the hackathon oracle")]
    UnauthorizedOracle,
    #[msg("The signer is not the hackathon organizer")]
    UnauthorizedOrganizer,
    #[msg("The hackathon has not started yet")]
    HackathonNotStarted,
    #[msg("The hackathon has already ended")]
    HackathonEnded,
    #[msg("Settlement has not started yet (end_ts + grace period)")]
    HackathonNotEnded,
    #[msg("day_index does not match the push day")]
    WrongDayIndex,
    #[msg("A fire for this day has already been recorded")]
    DayAlreadyRecorded,
    #[msg("Winners have already been set")]
    WinnersAlreadySet,
    #[msg("Invalid winners: 1..=3 distinct teams, bps > 0, sum of bps == 10000")]
    InvalidWinners,
    #[msg("A winning team does not belong to this hackathon")]
    WinnerTeamMismatch,
    #[msg("The participant has already been settled")]
    AlreadySettled,
    #[msg("The account belongs to a different hackathon")]
    WrongHackathon,
    #[msg("The hackathon is not finalized yet")]
    NotFinalized,
    #[msg("Winners have not been set yet")]
    WinnersNotSet,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("The participant is not a member of this team")]
    NotTeamMember,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("The hackathon is already finalized")]
    AlreadyFinalized,
    #[msg("Participant accounts passed to finalize must be writable")]
    AccountNotWritable,
    #[msg("The organizer cannot participate in their own hackathon")]
    OrganizerCannotParticipate,
    #[msg("pushed_at is in the future")]
    InvalidPushTime,
    #[msg("The push is older than the grace period")]
    FireTooLate,
    #[msg("The participant is disqualified")]
    Disqualified,
    #[msg("The participant is already disqualified")]
    AlreadyDisqualified,
    #[msg("The deadline for choosing winners has passed")]
    WinnersDeadlinePassed,
    #[msg("Nobody in this team met the goal")]
    TeamNotQualified,
    #[msg("The claim window is still open")]
    ClaimWindowOpen,
}
