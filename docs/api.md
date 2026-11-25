# EcoCycle REST API

Base URL: `http://localhost:3000`. Protected routes require `Authorization: Bearer <JWT>`. JSON endpoints use `Content-Type: application/json`. `POST /api/waste` uses `multipart/form-data` and requires the `photo` field.

## Authentication

- `POST /api/auth/register` - create a resident account (`name`, `email`, `password`). Public users cannot choose a role.
- `POST /api/auth/login` - authenticate with `email` and `password`.
- `GET /api/auth/me` - return the authenticated profile.
- `PATCH /api/auth/profile` - update `name` and `phone`.
- `PATCH /api/auth/wallet` - set `walletAddress` to a valid Ethereum address or `null`.

Passwords must be at least 10 characters and include uppercase, lowercase, and numeric characters. JWT lifetime defaults to 12 hours.

## Waste and Collection

- `POST /api/waste` (`user`) - register `deviceName`, `category`, `quantity`, `weightKg`, `condition`, `pickupAddress`, `preferredDate`, optional `description`, and a JPEG/PNG/WebP `photo` up to 5 MB. Returns the new request and one-time `pickupOtp`.
- `GET /api/waste/mine` (`user`) - list the caller's requests.
- `GET /api/waste/:id` - read a request if the caller owns it, is its assigned agent, or is an administrator.
- `GET /api/waste/all` (`admin`) - paginated and filterable request list (`page`, `limit`, `status`, `search`).
- `PATCH /api/waste/:id` (`admin`) - assign `assignedAgent`, assign `assignedRecycler` after collection, or update `preferredDate`. Status is never directly set through this endpoint.
- `POST /api/collection/assign` (`admin`) - assign a `requestId` (MongoDB ID) to an active `agentId`.
- `PATCH /api/collection/:id/verify` (`assigned agent`) - verify a request using its MongoDB ID and the resident's six-digit `otp`.
- `GET /api/collection/history` (`agent`, `admin`) - list collection assignments and verification history.

## Recycling

- `GET /api/recycler/available` (`recycler`) - list collected requests available to, or assigned to, the caller.
- `POST /api/recycler/receive` (`recycler`) - confirm receipt with MongoDB `requestId`.
- `POST /api/recycler/complete` (`assigned recycler`) - submit `requestId`, `recyclerReference`, and `certificateNumber`. Returns a confirmed transaction and credited reward. Duplicate completion retries return the existing records.
- `GET /api/recycler/history` (`recycler`, `admin`) - list assigned recycling requests.

## Rewards and Blockchain

- `GET /api/rewards/balance` (`user`) - current integer points balance.
- `GET /api/rewards/history` (`user`) - reward credits and redemptions.
- `POST /api/rewards/redeem` (`user`) - redeem a positive integer `points` with a UUID `idempotencyKey`. The operation fails if the balance is insufficient.
- `GET /api/blockchain/transactions` - return the caller's records (resident) or all records (staff).
- `GET /api/blockchain/verify/:requestId` - verify the request record directly against the contract. Residents can verify only their own request.
- `GET /api/blockchain/contract-info` (`admin`) - return the local registry address and chain ID.

## Administration

- `GET /api/admin/dashboard` (`admin`) - user count, request counts, collected/recycled weight, reward total, and transaction count.
- `GET /api/admin/users` (`admin`) - list and search accounts (`role`, `search`).
- `POST /api/admin/staff` (`admin`) - create an `agent` or `recycler` account. Recyclers require `organization` and `authorizationNumber`.
- `GET /api/admin/reports` (`admin`) - category totals and monthly completed recycling totals.

## Errors

Validation errors return HTTP 400, unauthenticated requests return 401, forbidden roles return 403, missing resources return 404, state conflicts and duplicate records return 409, and unexpected server errors return a generic 500 response. Detailed internal exceptions are logged server-side, not exposed to clients.