import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Deps } from "../deps.js";
import { HttpError } from "../http.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp<{ deps: Deps }>(async (app, { deps }) => {
  await app.register(jwt, { secret: deps.config.JWT_SECRET, sign: { expiresIn: "7d" } });
  app.decorate("authenticate", async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw new HttpError(401, "Unauthorized");
    }
  });
});

export async function currentUser(deps: Deps, req: FastifyRequest) {
  const user = await deps.prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!user) throw new HttpError(401, "Unknown user");
  return user;
}
