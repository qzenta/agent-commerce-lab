# Testnet Payout Wallet

**Date:** 14 Aug 2026
**Address:** `0x1866Fd80B1196AcC70A98a50917A8FD4639FE823`
**Network:** `base-sepolia` (testnet only — zero real monetary value)
**Status:** Live in `X402_PAY_TO`, funded with 20 test USDC, deployed to staging.

## Why the private key is not a Wrangler secret, `.dev.vars` entry, or anywhere in the Worker's runtime

Checked directly against `x402-hono`'s own type declarations before wiring anything in:

```
declare function paymentMiddleware(payTo: Address, routes: RoutesConfig, facilitator?: FacilitatorConfig, ...): ...
```

`paymentMiddleware` only ever takes the **public address** as `payTo`. There is no private key, signer, or wallet object anywhere in its signature. This makes sense once you think through the merchant's role in the protocol: the Worker is declaring *where* payment should go, not signing anything on Qzenta's behalf. The client (the paying agent) is the one who signs the EIP-3009 `transferWithAuthorization` payload with *their own* key; the facilitator submits it on-chain. The recipient's private key never enters the flow at all.

**Consequence:** there is no legitimate reason for the Worker (or any Wrangler secret, `.dev.vars` entry, or CI/CD variable feeding the Worker) to ever hold this private key. Giving it to the runtime would be pure unnecessary exposure with zero functional benefit — the same discipline problem as storing a credential nobody needs to use. So it wasn't stored as a secret at all.

## Where the private key actually lives

A local, gitignored file (`.wallet-secret.local`, pattern added to `.gitignore` before the file was ever created) on this machine — for Daniel's own future use if the funds in this wallet ever need to be moved or the wallet needs to be imported elsewhere. It has never been:
- Printed to chat or any tool output
- Committed to git (verified — `.wallet-secret.local` and the broader `*.local` pattern are in `.gitignore`, confirmed via `git status` before the file was created)
- Logged
- Set as a Wrangler secret or any runtime-accessible variable

If this reasoning is wrong for some future use case (e.g., a self-facilitation setup where Qzenta *does* need to sign transactions itself — see `MCP-PAIDTOOL-BLOCKER.md`'s and `COST-MODEL.md`'s notes on self-facilitation), that would be a new, separate key-handling decision at that time, not a reason to have pre-emptively exposed this one.

## Funding confirmation

- Requested via faucet.circle.com, Base Sepolia network, 20 USDC (the faucet's standard per-request amount).
- Circle's faucet flagged the automated submission as bot traffic (reCAPTCHA-adjacent check) — CC did not attempt to bypass this, per its own operating rules on never working around bot-detection. Daniel completed the actual faucet submission manually.
- **Balance confirmed independently, not just taken on Daniel's word:** direct `eth_call` to the Base Sepolia public RPC (`sepolia.base.org`), calling `balanceOf(address)` on the USDC contract address `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (this is the same contract address x402-hono itself resolves to for "USDC" on `base-sepolia`, taken from the live 402 response, not assumed from memory). Result: `20000000` atomic units = **20.0 USDC**, exactly matching the faucet's stated send amount.
- Explorer reference: `https://sepolia.basescan.org/address/0x1866Fd80B1196AcC70A98a50917A8FD4639FE823`

## What this does and doesn't unlock

**Unlocks:** the 402 challenge now advertises a real, funded, spendable address — an agent that actually paid would have a genuine, receivable transaction rather than sending funds into a burn address. The payment loop can now complete end-to-end, if a paying client exists.

**Does not unlock:** no end-to-end paid request has been attempted yet — that requires a *second* wallet acting as the payer, with its own funded balance and a client capable of constructing and signing the x402 payment payload. That's a separate scope decision, not assumed here (see the accompanying report).

**Still testnet-only:** `X402_NETWORK` remains `base-sepolia`. This wallet holds test USDC with no real-world value. Nothing about this step moves toward mainnet, production wallets, or real funds — those remain explicit, separate approval gates.
