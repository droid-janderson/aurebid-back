import { createHmac } from "crypto";
import { env } from "../../config/env";

export type PublicActor = "bidder" | "buyer" | "seller";

const PREFIX: Record<PublicActor, string> = {
  bidder: "Licitante",
  buyer: "Comprador",
  seller: "Vendedor",
};

export function publicActorLabel(
  batchId: string,
  userId: string,
  actor: PublicActor = "bidder",
): string {
  const code = createHmac("sha256", env.pseudonym.secret)
    .update(`${batchId}:${userId}`)
    .digest("hex")
    .slice(0, 4)
    .toUpperCase();

  return `${PREFIX[actor]} ${code}`;
}

export function serverTimeIso(): string {
  return new Date().toISOString();
}
