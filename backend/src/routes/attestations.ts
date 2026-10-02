import type { FastifyInstance } from "fastify";
import { PublicKey } from "@solana/web3.js";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Deps } from "../deps.js";
import { HttpError, explorerTx, parse } from "../http.js";
import { currentUser } from "../plugins/auth.js";
import { buildLetter, letterEmail, letterHash } from "../services/mail/letter.js";

export default async function attestationRoutes(app: FastifyInstance, { deps }: { deps: Deps }) {
  const { prisma, chain, mailer, config } = deps;

  /** Issues a participation letter: text off-chain, its SHA-256 on-chain, a copy by email. */
  const view = (a: { letterHash: string; letterBody: string; txSignature: string | null }, emailSent: boolean) => ({
    hash: a.letterHash,
    letter: a.letterBody,
    tx: a.txSignature ?? "",
    explorer: a.txSignature ? explorerTx(config.RPC_URL, a.txSignature) : "",
    verifyUrl: `${config.FRONTEND_URL}/verify/${a.letterHash}`,
    emailSent,
  });

  // Each letter costs the oracle a transaction, so: one per participant, after the end, rate limited.
  app.post(
    "/attestations",
    { preHandler: app.authenticate, config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req, reply) => {
    const body = parse(z.object({ participant: z.string() }), req.body);
    const user = await currentUser(deps, req);
    const p = await prisma.participant.findUnique({
      where: { id: body.participant },
      include: { user: true, team: true, hackathon: true },
    });
    if (!p) throw new HttpError(404, "Participant not found");
    const isSelf = p.userId === user.id;
    const isOrganizer = !!user.wallet && user.wallet === p.hackathon.organizer;
    if (!isSelf && !isOrganizer) throw new HttpError(403, "Only the participant or the organizer");

    if (Date.now() < p.hackathon.endTs.getTime()) {
      throw new HttpError(409, "Certificates are issued after the hackathon ends");
    }
    const existing = await prisma.attestation.findUnique({ where: { participantId: p.id } });
    if (existing) return view(existing, false);

    const onChain = await chain.fetchParticipant(new PublicKey(p.id));
    if (!onChain) throw new HttpError(409, "The participant is not confirmed on-chain");
    if (onChain.disqualified) throw new HttpError(409, "The participant was disqualified");

    const text = buildLetter({
      githubLogin: p.user.githubLogin,
      hackathonTitle: p.hackathon.title,
      teamName: p.team.name,
      start: p.hackathon.startTs,
      end: p.hackathon.endTs,
      fires: onChain.fires,
      requiredFires: p.hackathon.requiredFires,
      wallet: p.wallet,
      issuedAt: new Date(),
    });
    const hash = letterHash(text);
    const tx = await chain.recordAttestation(
      new PublicKey(p.hackathonId),
      new PublicKey(p.id),
      Buffer.from(hash, "hex"),
    );
    let saved;
    try {
      saved = await prisma.attestation.create({
        data: { participantId: p.id, letterHash: hash, letterBody: text, txSignature: tx },
      });
    } catch (e) {
      // A parallel request won the race: return its letter.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return view((await prisma.attestation.findUnique({ where: { participantId: p.id } }))!, false);
      }
      throw e;
    }

    let emailSent = false;
    if (p.user.email) {
      try {
        const emailId = await mailer.send({
          to: p.user.email,
          subject: `Proof of Build: certificate of participation — ${p.hackathon.title}`,
          text: letterEmail(text, hash, config.FRONTEND_URL),
        });
        emailSent = emailId !== null;
        if (emailId) await prisma.attestation.update({ where: { id: saved.id }, data: { emailId } });
      } catch (err) {
        req.log.error({ err }, "sending the letter failed");
      }
    }

    return reply.code(201).send(view(saved, emailSent));
    },
  );

  /** Public check of a letter hash. Returns no personal data. */
  app.get("/verify/:hash", async (req, reply) => {
    const { hash } = parse(
      z.object({ hash: z.string().regex(/^[0-9a-fA-F]{64}$/, "expected 64 hex characters") }),
      req.params,
    );
    const att = await prisma.attestation.findUnique({
      where: { letterHash: hash.toLowerCase() },
      include: { participant: { include: { team: true, hackathon: true } } },
    });
    if (!att) return reply.code(404).send({ valid: false, hash });

    const onChain = await chain.fetchAttestation(
      chain.attestationAddress(new PublicKey(att.participantId), Buffer.from(att.letterHash, "hex")),
    );
    return {
      valid: !!onChain,
      hash: att.letterHash,
      hackathon: { id: att.participant.hackathonId, title: att.participant.hackathon.title },
      team: att.participant.team.name,
      wallet: att.participant.wallet,
      recordedAt: onChain ? new Date(onChain.createdAt.toNumber() * 1000).toISOString() : null,
      tx: att.txSignature,
      explorer: att.txSignature ? explorerTx(config.RPC_URL, att.txSignature) : null,
    };
  });
}
