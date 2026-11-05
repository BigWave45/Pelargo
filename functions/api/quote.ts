import { Env, forwardJson, intentsRequest, json } from "../_lib/intents";

const MAX_BODY_BYTES = 12_000;

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  if (context.request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const contentLength = Number(context.request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: "Request body too large" }, 413);
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json() as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const requiredStrings = ["swapType", "originAsset", "destinationAsset", "amount", "recipient", "refundTo"];
  for (const field of requiredStrings) {
    if (typeof body[field] !== "string" || !(body[field] as string).trim()) {
      return json({ error: `Missing or invalid ${field}` }, 400);
    }
  }

  if (!/^\d+$/.test(body.amount as string) || BigInt(body.amount as string) <= 0n) {
    return json({ error: "amount must be a positive integer string in the relevant asset's smallest unit" }, 400);
  }
  if (!["EXACT_INPUT", "EXACT_OUTPUT"].includes(body.swapType as string)) {
    return json({ error: "Only EXACT_INPUT and EXACT_OUTPUT are enabled" }, 400);
  }
  if (typeof body.originAsset !== "string" || body.originAsset.length > 256 ||
      typeof body.destinationAsset !== "string" || body.destinationAsset.length > 256 ||
      typeof body.recipient !== "string" || body.recipient.length > 256 ||
      typeof body.refundTo !== "string" || body.refundTo.length > 256) {
    return json({ error: "One or more quote fields exceed allowed length" }, 400);
  }

  if (body.dry !== true && body.dry !== false) {
    return json({ error: "dry must be a boolean" }, 400);
  }

  // 1Click is mainnet. A committed quote creates a real deposit address.
  // Keep this disabled until the operator deliberately enables mainnet deposits.
  if (body.dry === false && context.env.ALLOW_MAINNET_DEPOSITS !== "true") {
    return json({
      error: "Mainnet deposit quotes are disabled. Only dry-run quotes are currently permitted.",
      code: "MAINNET_DEPOSITS_DISABLED",
    }, 403);
  }

  const enumFields: Record<string, string[]> = {
    depositType: ["ORIGIN_CHAIN", "INTENTS", "CONFIDENTIAL_INTENTS"],
    refundType: ["ORIGIN_CHAIN", "INTENTS", "CONFIDENTIAL_INTENTS"],
    recipientType: ["DESTINATION_CHAIN", "INTENTS", "CONFIDENTIAL_INTENTS"],
  };
  for (const [field, allowed] of Object.entries(enumFields)) {
    if (body[field] !== undefined &&
        (typeof body[field] !== "string" || !allowed.includes(body[field] as string))) {
      return json({ error: `${field} must be one of: ${allowed.join(", ")}` }, 400);
    }
  }

  // The upstream currently rejects missing route types and deadline, so require
  // them at our boundary rather than forwarding a predictably invalid request.
  for (const field of ["depositType", "refundType", "recipientType"]) {
    if (typeof body[field] !== "string") {
      return json({ error: `${field} is required` }, 400);
    }
  }
  if (typeof body.deadline !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(body.deadline) ||
      !Number.isFinite(Date.parse(body.deadline)) ||
      Date.parse(body.deadline) <= Date.now()) {
    return json({ error: "deadline must be a future ISO 8601 timestamp" }, 400);
  }

  const slippage = body.slippageTolerance;
  if (slippage !== undefined &&
      (typeof slippage !== "number" || !Number.isFinite(slippage) || slippage < 1 || slippage > 1000)) {
    return json({ error: "slippageTolerance must be between 1 and 1000 basis points" }, 400);
  }

  const allowedKeys = new Set([
    "dry", "swapType", "originAsset", "destinationAsset", "amount",
    "recipient", "refundTo", "depositType", "recipientType", "refundType",
    "slippageTolerance", "deadline", "quoteWaitingTimeMs",
    "referral", "sessionId",
  ]);
  const unknownKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length) {
    return json({ error: "Unsupported quote fields", fields: unknownKeys }, 400);
  }

  try {
    const upstream = await intentsRequest("quote", {
      method: "POST",
      body: JSON.stringify(body),
    }, context.env);
    return await forwardJson(upstream);
  } catch {
    return json({ error: "Unable to reach the NEAR Intents quote service" }, 502);
  }
}
