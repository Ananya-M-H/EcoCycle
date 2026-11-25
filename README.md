# EcoCycle

EcoCycle is a web platform for tracking electronic waste from a resident's pickup request through collection and authorized recycling. Residents can follow each request and receive points for recycling verified on an Ethereum-compatible blockchain. Administrators coordinate staff and requests, collection agents verify pickups, and recycler facilities confirm receipt and recycling. The project is configured for local development with a vanilla JavaScript interface, an Express API, MongoDB, and a Solidity registry on Hardhat.

## Features

### Resident

- Register and sign in, manage a profile, and connect or update a MetaMask address for recycling rewards.
- Submit an e-waste request with device name, category, quantity, condition, weight, pickup address, preferred date, optional description, and a required photo.
- Receive a six-digit pickup code when submitting a request; share it with the assigned collection agent to verify pickup.
- View request statuses and history, wallet connection, reward balance, and reward activity.
- Redeem available points with duplicate-safe processing.

### Administrator

- View an operational dashboard with request counts, collection and recycling weights, rewards distributed, and blockchain transaction totals.
- Search and review user, request, collection, and recycling activity; view category and monthly recycling reports.
- Create, edit, deactivate, and reactivate collection-agent and recycler accounts. Recycler accounts include organization and authorization details.
- Assign active collection agents and authorized recyclers to requests, and adjust preferred pickup dates.
- Oversee the workflow from assignment through collection, receipt, and recycling, with required pickup and recycler evidence.
- Review blockchain transaction history and verify request records against the deployed contract.

### Collection agent

- View assigned pickups and collection history.
- Verify pickup using the resident's six-digit code; successful verification advances the request to `COLLECTED`.

### Recycler

- View collected requests available to or assigned to the active recycler facility.
- Confirm receipt, then record recycling with the facility record reference and certificate number.
- View assigned recycling history. The reference is included in the blockchain record; the certificate number is retained with the request in MongoDB.

### Platform and audit

- Enforce role-based access and sequential request states: `REQUESTED` → `ASSIGNED` → `COLLECTED` → `RECEIVED` → `RECYCLED`.
- Record verified recycling on-chain with a request identifier hash, resident wallet, weight, reward points, recycler reference, timestamp, and transaction identifier.
- Credit rewards only after blockchain confirmation. MongoDB transactions and uniqueness constraints prevent duplicate credits; redemption is idempotent.
- Keep personal information, pickup codes, photos, and certificate numbers off-chain. Uploaded JPEG, PNG, and WebP images are signature-checked and limited to 5 MB.
- Use JWT authorization, hashed passwords, API rate limits, request validation, MongoDB query sanitization, and Helmet security headers; password fields can be shown or hidden in the interface.

## System Methodology

EcoCycle uses a staged, evidence-based workflow. Each step is authorized by the backend and changes a request to the next valid state:

1. **Request:** A resident submits device and pickup details with a photo. The backend creates a `REQUESTED` record and generates a one-time six-digit pickup code. The code is shown to the resident, while only its hash is stored.
2. **Assignment:** An administrator assigns an active collection agent and an authorized recycler. The request moves to `ASSIGNED`.
3. **Collection:** The assigned agent obtains the pickup code from the resident and submits it for verification. A successful check marks the request `COLLECTED`.
4. **Receipt:** The assigned recycler confirms that the collected items arrived at the facility. The request moves to `RECEIVED`.
5. **Recycling verification:** Once processing is complete, the recycler supplies the facility's record reference and certificate number. The resident must have a wallet connected before recycling can be finalized.
6. **Blockchain and reward:** The backend's authorized blockchain service records the request hash, wallet, weight, recycler reference, and reward points on the contract. After transaction confirmation, one MongoDB transaction records the blockchain transaction and reward, marks the request `RECYCLED`, and updates the resident's balance.
7. **Audit and redemption:** Residents and staff can review the appropriate history; blockchain records can be checked against the contract. Residents can redeem points, with safeguards against duplicate processing.

Points are calculated at 10 points per kilogram, using weight rounded to the nearest gram and integer rounding down. Points are an in-app reward balance, not a transferable token.

## Actors and Responsibilities

| Actor | Responsibilities |
| --- | --- |
| Resident | Creates requests, provides pickup details and the pickup code to the agent, connects a wallet for rewards, tracks status, and manages points. |
| Administrator | Provisions and manages staff, assigns agents and recyclers, oversees request progression, and reviews dashboards, reports, and audit records. |
| Collection agent | Handles assigned pickups and verifies the resident's one-time pickup code. |
| Authorized recycler | Confirms facility receipt, provides recycling record details after processing, and reviews assigned recycling history. |
| EcoCycle backend | Authenticates users, enforces roles and state transitions, validates data, stores application records, and coordinates blockchain writes and reward credits. |
| Local blockchain | Stores the verified recycling audit record and supports transaction lookup; it does not store residents' personal details or uploaded photos. |

## Data Flow and Storage

1. The browser sends role-authenticated requests to the Express API. The API validates input and permissions before changing application state.
2. MongoDB stores users, wallet addresses, waste requests with current status and lifecycle timestamps, collection assignments, recycler details, rewards, and blockchain transaction metadata. Uploaded photos are stored under `uploads/`.
3. On request creation, the backend returns the pickup code to the resident once and stores only a hash for later verification.
4. When a resident connects MetaMask, EcoCycle saves the selected wallet address to that resident's MongoDB profile. The address identifies the reward recipient; it does not replace account sign-in.
5. When recycling is verified, the backend submits the recycling record through its configured authorized signer to the Solidity registry. The contract stores the audit facts, not names, addresses, photos, pickup codes, or certificate numbers.
6. After blockchain confirmation, MongoDB transactionally stores the transaction and reward, updates the request and resident balance, and prevents duplicate reward credits. The interface then displays the updated status and history for each role.

## Technology

- Node.js 20 or newer, Express 4, vanilla HTML/CSS/JavaScript.
- MongoDB and Mongoose 8.
- Solidity 0.8.28, Hardhat 2, ethers.js 6.
- bcryptjs, JSON Web Tokens, Zod, Multer, Helmet.

## Prerequisites

- Node.js 20+ and npm.
- MongoDB 7+ running as a replica set. A single-node replica set is sufficient for local development; transaction support is required for atomic reward accounting.
- MetaMask for resident wallet connection (optional until recycling is completed).

The repository does not include credentials or a default administrator password. Create them in your local `.env` file and seed the first administrator as described below.

## Local Setup (Windows PowerShell)

1. Install Node.js 20+ and MongoDB Community Server, then open a PowerShell terminal in this project folder. On the current development machine, portable Node.js 22.21.1 and MongoDB 8.0.17 are available in user-local AppData; to use them in a new terminal without a machine-wide install:

```powershell
$env:PATH = "$env:LOCALAPPDATA\EcoCycleTools\node-v22.21.1-win-x64;$env:PATH"
$mongoBin = "$env:LOCALAPPDATA\EcoCycleTools\mongodb\mongodb-win32-x86_64-windows-8.0.17\bin"
```
2. Install dependencies and prepare local configuration:

```powershell
npm.cmd install
npm.cmd run env:init
```

3. `env:init` creates `.env` only if it does not already exist. It generates a random JWT secret and local administrator password without printing the password. Open `.env` locally to see the generated sign-in credentials. Keep `.env` private; it is ignored by Git. Leave `BLOCKCHAIN_PRIVATE_KEY` blank until the local chain is running.
4. Start MongoDB as a local replica set. Set `<MongoDB bin>` to the folder containing `mongod.exe`:

```powershell
New-Item -ItemType Directory -Force C:\data\ecocycle | Out-Null
& "$mongoBin\mongod.exe" --dbpath C:\data\ecocycle --replSet rs0 --bind_ip 127.0.0.1 --port 27017
```

In a second terminal, initialize the replica set once:

```powershell
npm.cmd run db:init
```

The initializer safely reports if the replica set was already configured; no separate MongoDB shell is required.

Use the replica-set URI in `.env`: `mongodb://127.0.0.1:27017/ecocycle?replicaSet=rs0`.

5. Start the local chain in a separate terminal:

```powershell
npm.cmd run chain
```

The Hardhat node prints disposable local development accounts. Set `BLOCKCHAIN_PRIVATE_KEY` in `.env` to the private key for the first local account (the contract deployer, automatically authorized as a verifier). This key is for the local test chain only. Never use a real wallet key or deploy this configuration to a public network.

6. Compile and deploy the registry from another terminal:

```powershell
npm.cmd run compile
npm.cmd run deploy:local
```

The script writes the address and chain metadata to `blockchain/deployments/31337.json` (ignored by Git). The backend reads this file automatically. Set `CONTRACT_ADDRESS` only if you need to override it.

7. Seed the administrator and start EcoCycle:

```powershell
npm.cmd run seed:admin
npm.cmd start
```

Open [http://localhost:3000](http://localhost:3000). Create resident accounts from the registration screen. Administrator credentials are the values configured in `.env`; there are no shared demo credentials.

To restart the app, keep MongoDB and the Hardhat node running, then run `npm.cmd start`. The local chain state is reset when its node process is restarted; redeploy the contract and use fresh test records afterward.

## Recycler Verification Demo

Before verifying recycling, the resident who submitted the request must connect MetaMask so the reward can be associated with their wallet. After the request has been collected and the recycler confirms receipt, the recycler enters:

- **Facility record reference:** In a demo, use a clearly marked placeholder such as `DEMO-REC-001`. In real use, enter the facility's actual intake, processing, batch, or job reference for the request.
- **Certificate number:** In a demo, use a clearly marked placeholder such as `DEMO-CERT-001`. In real use, enter the number from the official recycling certificate issued after processing.

The demo values are examples only, not evidence of real recycling or regulatory compliance. EcoCycle checks that both values are present but does not generate or independently verify them. The recycler reference is included in the blockchain record; the certificate number is stored with the request in MongoDB.

## Development and Tests

```powershell
npm.cmd run dev
npm.cmd run compile
npm.cmd test
```

`npm.cmd test` runs the contract suite, covering rewards, access control, invalid inputs, emitted events, and duplicate prevention.

For an end-to-end HTTP test, keep MongoDB, the Hardhat node, the deployed contract, and the API running. In another terminal, set the seeded administrator credentials and a funded local Hardhat account address, then run:

```powershell
$env:TEST_ADMIN_EMAIL = 'admin@example.local'
$env:TEST_ADMIN_PASSWORD = '<your local admin password>'
$env:TEST_WALLET_ADDRESS = '<funded local Hardhat address>'
npm.cmd run test:api
```

The integration test creates uniquely named users and staff and exercises registration, role denial, photo upload, agent assignment, OTP verification, recycler receipt, on-chain completion, reward credit, verification, and idempotent redemption. Use a disposable local database for these tests.

## Project Structure

```text
backend/
  config/          MongoDB connection
  controllers/     Authentication, waste, collection, recycling, rewards, admin
  middleware/     JWT roles, validation, upload, errors
  models/          Mongoose schemas
  routes/          REST API routers
  scripts/         Administrator seed script
  services/        Blockchain integration
blockchain/
  contracts/       Solidity registry
  scripts/         Local deployment
public/            Responsive HTML, CSS, and JavaScript application
tests/             Hardhat and HTTP integration tests
uploads/           Local uploaded photos (ignored by Git)
docs/              Architecture and API reference
```

## API Reference

All protected routes require `Authorization: Bearer <JWT>`. Public registration and login are rate limited. Detailed request and response behavior is in [docs/api.md](docs/api.md).

| Area | Routes |
| --- | --- |
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `PATCH /api/auth/profile`, `PATCH /api/auth/wallet` |
| Waste | `POST /api/waste`, `GET /api/waste/mine`, `GET /api/waste/:id`, `GET /api/waste/all`, `PATCH /api/waste/:id` |
| Collection | `POST /api/collection/assign`, `PATCH /api/collection/:id/verify`, `GET /api/collection/history` |
| Recycler | `GET /api/recycler/available`, `POST /api/recycler/receive`, `POST /api/recycler/complete`, `GET /api/recycler/history` |
| Rewards | `GET /api/rewards/balance`, `GET /api/rewards/history`, `POST /api/rewards/redeem` |
| Blockchain | `GET /api/blockchain/transactions`, `GET /api/blockchain/verify/:requestId`, `GET /api/blockchain/contract-info` (admin) |
| Admin | `GET /api/admin/dashboard`, `GET /api/admin/users`, `POST /api/admin/staff`, `GET /api/admin/reports` |

## Database and Data Integrity

Mongoose models: `User`, `WasteRequest`, `Collection`, `Recycler`, `Reward`, and `BlockchainTransaction`. Password hashes are excluded from normal reads. Only roles and workflow transitions authorized by the API can mutate lifecycle state. Reward credit, blockchain transaction metadata, request completion, and user balance updates are committed in one MongoDB transaction after chain confirmation. Unique indexes enforce one reward and one database transaction per request. Redemption uses a transaction, a conditional balance update, and a unique idempotency key.

## Smart Contract

`EcoCycleRegistry.sol` stores only the request hash, wallet, weight in grams, reward points, recycler reference, timestamp, and generated transaction identifier. It emits `RecyclingRecorded`, prevents duplicate request hashes, tracks on-chain point totals, and restricts writes to owner-authorized verifiers. Personal details and photographs remain off-chain. Read [docs/architecture.md](docs/architecture.md) for the trust boundaries and data flow.

## Screenshots Guide

Run the app with the local chain and MongoDB active. Sign in with a resident, agent, recycler, and administrator account to capture each role view. Useful screens are the resident overview, registration form, collection tracking, reward history, agent OTP verification, recycler queue, administrator request assignment, and blockchain history. Keep real addresses, OTPs, and personal details out of shared screenshots.

## Troubleshooting

- **MongoDB transaction error:** verify MongoDB was started with `--replSet rs0`, run `rs.initiate()` once, and confirm the URI includes `?replicaSet=rs0`.
- **Cannot connect to MongoDB:** check that `mongod` is running on `127.0.0.1:27017` and `MONGODB_URI` in `.env` is correct.
- **Blockchain is not deployed:** keep `npm.cmd run chain` running, then run `npm.cmd run compile` and `npm.cmd run deploy:local`.
- **Unauthorized blockchain write:** set `BLOCKCHAIN_PRIVATE_KEY` to a local Hardhat account authorized by the deployed registry. The deployer account is authorized by default.
- **Photo rejected:** use a real JPEG, PNG, or WebP file below 5 MB; the server checks both MIME type and file signature.
- **Rewards require a wallet:** connect MetaMask on the local Hardhat network and save the account address before recycling is completed.
- **Port conflict:** set `PORT` in `.env` and update `FRONTEND_ORIGIN` to match.
- **PowerShell blocks `npm`:** use `npm.cmd` so the shell does not invoke the restricted `npm.ps1` shim.

## Production Notes

This repository is configured for local development. Before production use, add managed secrets, HTTPS, a managed replica-set database, private image storage, monitoring, audited account provisioning, production chain configuration, and an operational signer/key-management strategy. The local Hardhat private key must never be reused on a real network.

### Simplified steps to run
Terminal 1 — MongoDB

& "C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe" --dbpath C:\data\ecocycle-rs --replSet rs0 --bind_ip 127.0.0.1 --port 27018

Terminal 2 — Initialize MongoDB (run once; if already initialized, that’s fine)
Set-Location "D:\GreenChain\EcoCycle\v1"
npm.cmd run db:init

Terminal 3 — Local blockchain
Set-Location "D:\GreenChain\EcoCycle\v1"
npm.cmd run chain

Terminal 4 — Deploy and run EcoCycle
Set-Location "D:\GreenChain\EcoCycle\v1"
npm.cmd run compile
npm.cmd run deploy:local
npm.cmd run seed:admin
npm.cmd start

Then open http://localhost:3000.

ASSIGNED → COLLECTED: enter and verify the resident’s pickup code.
COLLECTED → RECEIVED: confirm receipt for the assigned active recycler.
RECEIVED → RECYCLED: provide the recycler reference and certificate. This records the transaction on-chain and credits the resident’s rewards.