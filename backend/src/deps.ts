import type { PrismaClient } from "@prisma/client";
import type { Config } from "./config.js";
import type { Chain } from "./services/solana/chain.js";
import type { GithubService } from "./services/github/client.js";
import type { Mailer } from "./services/mail/mailer.js";

export type Deps = {
  config: Config;
  prisma: PrismaClient;
  chain: Chain;
  github: GithubService;
  mailer: Mailer;
};
