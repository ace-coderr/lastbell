# Mainnet deployment runbook

Each step says who does it. Anything that signs with a private key or moves funds is done by the owner. The scripts default to a dry run, and only send when told to with `:broadcast`. Keys live only in `contracts/.env` (gitignored) and in a Cloudflare secret.

All commands run from the repo root unless noted.

## 1. Wallets (owner)

Create **two fresh wallets** in a browser wallet (Rabby or MetaMask). Never reuse a personal wallet.

| Wallet | Used for |
|---|---|
| **Deployer / test user** | deploys the contract; places the real demo orders through the site |
| **Keeper** | bonds $WIF and executes orders from the Cloudflare Worker |

Share only the two **public** addresses.

## 2. Funding on Robinhood Chain (owner)

Add the network (chain ID 4663, RPC `https://rpc.mainnet.chain.robinhood.com`, explorer `https://robinhoodchain.blockscout.com`). The site also offers to add it.

| Wallet | ETH (gas) | $WIF | Stock / USDG |
|---|---|---|---|
| Deployer / test user | ~0.002 (deploy ≈ 0.0001) | ~200 (fees for several orders, 20 WIF minimum each) | a few dollars of NVDA, SPY or AAPL for stop-losses; ~10 USDG for a limit buy |
| Keeper | ~0.003 | 20,000 + a little spare (minimum bond) | none |

## 3. Preflight (assistant, read-only)

```bash
npx cross-env ADDRESSES=0xDEPLOYER,0xKEEPER npm run mainnet:preflight -w contracts
```

This checks the chain ID, gas price and every balance above. It needs no keys.

## 4. Keys into `contracts/.env` (owner)

Copy `contracts/.env.example` to `contracts/.env` in your own editor and paste the two private keys there. Don't paste them in chat or anywhere else.

## 5. Deploy (owner)

```bash
npm run mainnet:deploy -w contracts
```

This is the dry run. It runs the constructor against the real tokens, feeds and pools and prints the gas cost. If it reads `Constructor OK`, send it:

```bash
npm run mainnet:deploy:broadcast -w contracts
```

The result is written to `contracts/deployments/robinhood-mainnet.json` (public data, committed).

## 6. Verify and wire up (assistant)

- Verify the source on Blockscout.
- Record the deployment transaction in [TRANSACTIONS.md](TRANSACTIONS.md).
- Set `LASTBELL_ADDRESS` for the keeper, and `VITE_LASTBELL_ADDRESS` / `VITE_DEPLOY_BLOCK` / `VITE_KEEPER_URL` for the site.

## 7. Keeper bond (owner)

```bash
npm run mainnet:bond -w contracts
```

```bash
npm run mainnet:bond:broadcast -w contracts
```

This makes an exact approval and bonds 20,000 WIF, the minimum. That backs up to 10 claims at once.

## 8. Cloudflare (owner logs in; assistant deploys; owner sets the secret)

1. Owner: `npx wrangler login` (opens the browser).
2. Assistant: deploys the keeper Worker from `keeper/` (cron every minute; the KV namespace is created automatically).
3. Owner, from `keeper/`:

   ```bash
   npx wrangler secret put KEEPER_PRIVATE_KEY
   ```

   Paste the keeper key into the hidden prompt.
4. Assistant: deploys the site to Cloudflare Pages from `web/` (the Pages Function for the region notice is included), then checks `/status` and the live site.

## 9. Real orders (owner places them; assistant watches and records)

With the deployer wallet on the live site:

1. **Stop-loss that fills:** a trigger slightly *above* the live price during market hours. The keeper should claim and fill it within a minute or two.
2. **Limit buy that waits:** a limit well below the price. It shows *Armed*.
3. **Cancel:** cancel the limit buy. Funds and fee come back.
4. **Weekend:** a stop-loss placed after Friday 20:00 ET shows *Queued until open* and fills after Monday's first price update if its trigger is crossed.

The assistant records every transaction hash in [TRANSACTIONS.md](TRANSACTIONS.md) with explorer links.
