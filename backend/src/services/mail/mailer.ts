import { Resend } from "resend";

export interface Mailer {
  /** Returns the provider message id, or null when sending is disabled. */
  send(msg: { to: string; subject: string; text: string }): Promise<string | null>;
}

export class ResendMailer implements Mailer {
  private readonly resend: Resend | null;

  constructor(
    apiKey: string | undefined,
    private readonly from: string,
  ) {
    this.resend = apiKey ? new Resend(apiKey) : null;
  }

  async send(msg: { to: string; subject: string; text: string }): Promise<string | null> {
    if (!this.resend) return null;
    const { data, error } = await this.resend.emails.send({ from: this.from, ...msg });
    if (error) throw new Error(`Resend: ${error.message}`);
    return data?.id ?? null;
  }
}
