// A2 — controlled testnet harness run (authorized: testnet only, no real funds).
// Pass 1: the approved A1 design ceilings against the REAL $3.00 VAT API quote.
// Pass 2: a DOCUMENTED harness-only ceiling override (per-tx + per-service raised to $4.00)
//         to exercise the real x402 payment client + on-chain settlement verification with
//         the UNFUNDED payer wallet — nothing can settle, so this exercises the real
//         payment-failure and ambiguous->verify->failed paths.
const { readFileSync, writeFileSync } = require("node:fs");
const { TransactionMachine, Ledger, LiveWorld, A1_POLICY, A1_TASKS, VAT_API_STAGING, VAT_API_PAID_ROUTE } = require("./a2-lib.cjs");

async function main() {
  const NOW = new Date().toISOString();
  const PAYER_KEY = readFileSync(".payer-wallet-secret.local", "utf8").trim();
  const transcript = [];
  const log = (line) => {
    transcript.push(line);
    console.log(line);
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));

  // 1. REAL price from the live 402 challenge.
  const challenge = await fetch(VAT_API_STAGING + VAT_API_PAID_ROUTE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ period: "2026-07", netAmount: 1000, vatRate: 15 }),
  });
  const challengeJson = await challenge.json();
  const maxAmountRequired = challengeJson.accepts[0].maxAmountRequired;
  const realPriceCents = Number(maxAmountRequired) / 10000; // USDC 6 decimals -> cents
  log(`=== A2 live challenge: status ${challenge.status}; maxAmountRequired ${maxAmountRequired} (=$ ${(realPriceCents / 100).toFixed(2)}) ===`);

  async function runPass(name, policy) {
    const ledger = new Ledger();
    const world = new LiveWorld({ payerKey: PAYER_KEY, log });
    const machine = new TransactionMachine(ledger);
    log(`\n--- ${name} ---`);
    const result = await machine.run({
      txId: `a2-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      agentId: "dsh-a2-harness",
      task: "tax",
      policy,
      taskMap: A1_TASKS,
      ledger,
      world,
      now: NOW,
    });
    log(`result: ${result.outcome} | selected: ${result.selectedServiceId} | paymentsSettled: ${result.paymentsSettled} | paymentAttempts: ${result.paymentAttempts} | nonces: ${JSON.stringify(result.nonces)}`);
    log(`notes: ${JSON.stringify(result.notes)}`);
    log(`exchange errors: ${JSON.stringify(world.exchangeErrorLog())}`);
    return { ledger, result, world };
  }

  // PASS 1 — approved A1 design ceilings, REAL price.
  const policy1 = clone(A1_POLICY);
  policy1.eligibleServices = policy1.eligibleServices.map((s) => (s.id === "vat-api" ? { ...s, priceCents: realPriceCents } : s));
  const pass1 = await runPass("PASS-1 approved ceilings (real $3.00 quote)", policy1);

  // PASS 2 — documented harness-only override to exercise the payment client (unfunded).
  const policy2 = clone(A1_POLICY);
  policy2.eligibleServices = policy2.eligibleServices.map((s) => (s.id === "vat-api" ? { ...s, priceCents: realPriceCents } : s));
  policy2.ceilings.perTxCents = 400; // harness-only: raise global per-tx to $4.00
  policy2.ceilings.perServiceCents["vat-api"] = 400; // harness-only: raise VAT API ceiling to $4.00
  const pass2 = await runPass("PASS-2 harness override (unfunded payer exercise)", policy2);

  // Evidence files.
  writeFileSync("docs/A2-pass1-ledger.json", JSON.stringify(pass1.ledger.entries, null, 2));
  writeFileSync("docs/A2-pass2-ledger.json", JSON.stringify(pass2.ledger.entries, null, 2));
  writeFileSync("docs/A2-transcript.txt", transcript.join("\n"));
  log("\n=== A2 evidence written: docs/A2-pass1-ledger.json, docs/A2-pass2-ledger.json, docs/A2-transcript.txt ===");
}

main().catch((err) => {
  console.error("A2 RUN FAILED:", err);
  process.exit(1);
});
