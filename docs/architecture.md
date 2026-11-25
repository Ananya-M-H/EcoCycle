# EcoCycle Architecture

## Components

- `public/` is a responsive single-page interface written in HTML, CSS, and browser JavaScript. It uses bearer-token REST calls and renders distinct navigation for residents, collection agents, recyclers, and administrators.
- `backend/` is an Express application. Routers define endpoint boundaries, middleware checks JWT identity and roles, controllers validate state transitions, Mongoose models enforce persistence constraints, and the blockchain service submits or verifies contract calls through ethers.js.
- MongoDB stores account data, addresses, photographs' paths, request state, and reward history. MongoDB must run as a replica set because reward credit and redemption use multi-document transactions.
- `EcoCycleRegistry.sol` stores a hash of the public request identifier plus verified recycling facts. Names, addresses, OTPs, passwords, and photos are not sent on-chain.

## Trust Boundaries

Public account registration creates only the `user` role. An administrator provisions agent and recycler accounts. A recycler profile is created alongside recycler staff credentials. Each protected request reloads the active account from MongoDB, so a client-supplied role is never trusted.

Collection is assigned by an administrator. The assigned agent compares a resident-issued, one-time OTP hash and transitions the request to `COLLECTED`. A recycler with an active profile can receive only collected requests available to that facility, and only the assigned recycler can complete it.

## Recycling and Rewards

1. The recycler submits a request ID, facility reference, and certificate number.
2. The backend checks the user wallet and request state, hashes the public request ID, and submits the weight and reference to the verifier-gated contract.
3. The backend waits for a successful receipt and reads the emitted event and stored record.
4. One MongoDB transaction stores the chain transaction, creates the unique reward credit, marks the request recycled, and increments the user's points balance.
5. If the HTTP request is retried after a chain confirmation, the backend finds the existing on-chain request and event, then uses the unique database constraints to avoid double credit.

Points equal `floor(weight in grams * 10 / 1000)`. This is the integer form of 10 points per kilogram, with weight rounded to the nearest gram before submission. The platform issues points, not a transferable token.

## Important Operational Assumptions

- The local chain is ephemeral. Restarting Hardhat resets the registry; redeploy and use fresh workflow records.
- The development signer is loaded from `BLOCKCHAIN_PRIVATE_KEY`, never stored in source or deployment metadata.
- The initial deployment owner is an authorized verifier. Additional verifier access is granted by the owner through `setVerifier`.
- Files are stored under `uploads/` using random names and validated image signatures. A production deployment should use private object storage and malware scanning.
- MongoDB transactions require a replica set, including for a single-node local development database.