# Aurebid Backend

Backend API for an auction house platform built with Node.js, TypeScript, Express, PostgreSQL, Prisma ORM, and Docker.

## 🚀 Features

- **Authentication & Authorization**: JWT access/refresh tokens with role-based access control (`ADMIN`, `AUCTIONEER`, `BIDDER`)
- **Lots (catalog)**: Auctioneer-owned lots with external product reference (`productSource` + `externalProductId`) and flexible `productData`
- **Auction lifecycle**: `DRAFT` → `SCHEDULED` → `ACTIVE` → `ENDED` → `SETTLED` (or `CANCELLED`)
- **Real-time bidding**: Socket.io rooms per lot with live bid and status events
- **Wallets**: Balance, active bid reservations and full transaction history
- **Tamper-evident bid audit**: SHA-256 hash chain per lot (`BidAudit`) with an integrity check endpoint
- **Settlements**: Automatic creation when a lot ends and atomic buyer debit / seller credit when completed
- **Background jobs**: Scheduled lots start automatically and expired lots are closed
- **Rate limiting & security**: Helmet, CORS, rate limiting

## 📋 Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Docker & Docker Compose (optional)
- npm

## 🛠️ Installation

### Local Development

1. **Install dependencies:**
```bash
npm install
```

2. **Set up environment variables:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start PostgreSQL (using Docker):**
```bash
docker-compose up -d postgres
```

4. **Sync the database schema:**
```bash
npm run prisma:migrate
# or, for a quick sync without a migration file:
npx prisma db push
```

5. **Seed the database:**
```bash
npm run prisma:seed
```

6. **Start the development server:**
```bash
npm run dev
```

The server will be running at `http://localhost:3000`.

### Using Docker

```bash
# Build and start all services
docker-compose up -d --build

# View logs
docker-compose logs -f app
```

## 📚 API Documentation

With the server running, the interactive Swagger UI is available at:

- `http://localhost:3000/docs`

At the top of the docs page there are two export buttons:

- **Baixar coleção Postman** — downloads `aurebid.postman_collection.json` with every route, path/query parameters and request body examples, grouped by tag.
- **Baixar OpenAPI (JSON)** — downloads the raw OpenAPI document.

You can import the Postman collection directly (File → Import). The collection uses the variables `baseUrl` (default `http://localhost:3000`) and `accessToken`. After calling `POST /api/v1/auth/login`, put the returned `accessToken` in the collection variable to authorize the protected routes.

The files are also served directly at:

- `http://localhost:3000/docs/postman.json`
- `http://localhost:3000/docs/openapi.json`

## 📁 Project Structure

```
src/
├── app.ts                 # Express app setup
├── server.ts              # Entry point with Socket.io
├── config/
│   ├── env.ts             # Environment configuration
│   └── database.ts        # Prisma client
├── modules/
│   ├── auth/              # Authentication and user management
│   ├── catalog/           # Lot CRUD (product catalog)
│   ├── auctions/          # Lot lifecycle and bidding
│   ├── bids/              # Bid queries
│   ├── wallets/           # Wallets, reservations and transactions
│   ├── settlements/       # Settlement processing
│   └── audit/             # Bid audit hash chain
├── sockets/
│   ├── socket.server.ts   # Socket.io setup
│   └── auction.socket.ts  # Lot socket events
├── jobs/
│   └── close-auctions.job.ts  # Background jobs
├── shared/
│   ├── errors/            # Custom error classes
│   ├── middlewares/       # Express middlewares
│   ├── types/             # TypeScript types
│   └── utils/             # Utility functions (including the audit chain)
└── routes/
    └── index.ts           # Route registration
```

## 🗃️ Data Model (summary)

| Model | Purpose |
|---|---|
| `User` | Account with role (`ADMIN`, `AUCTIONEER`, `BIDDER`) |
| `Lot` | Auction lot: product data, prices, window and status |
| `Bid` | Immutable bid (lot + bidder + amount + timestamp) |
| `BidAudit` | Per-lot hash chain entry for each bid |
| `Wallet` | User balance |
| `WalletReservation` | Funds reserved by a bidder for a lot |
| `WalletTransaction` | Financial movements (`DEPOSIT`, settlement debit/credit, `REFUND`, `ADJUSTMENT`) |
| `Settlement` | Buyer/seller settlement for a finished lot |

## 🔐 API Endpoints

All routes are prefixed with `/api/v1`.

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register (`BIDDER` or `AUCTIONEER`) |
| POST | `/auth/login` | Login |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Logout (stateless) |
| GET | `/auth/me` | Current user + wallet |
| PUT | `/auth/me` | Update profile (`name`) |
| POST | `/auth/change-password` | Change password |
| GET | `/auth/users` | List users (Admin) |
| GET | `/auth/users/:id` | Get user (Admin) |
| PUT | `/auth/users/:id/role` | Change user role (Admin) |
| DELETE | `/auth/users/:id` | Delete user (Admin) |

### Catalog (lots)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/catalog/lots` | List public lots |
| GET | `/catalog/lots/mine` | List own lots (Auctioneer/Admin) |
| GET | `/catalog/lots/:id` | Get lot details |
| POST | `/catalog/lots` | Create lot (Auctioneer/Admin) |
| PUT | `/catalog/lots/:id` | Update lot while draft/scheduled |
| DELETE | `/catalog/lots/:id` | Delete a draft lot |

### Auctions (lifecycle & bidding)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auctions` | List lots with timing info |
| GET | `/auctions/:id` | Get lot details |
| GET | `/auctions/:id/bids` | List lot bids |
| POST | `/auctions/:id/publish` | Publish lot (Auctioneer/Admin) |
| POST | `/auctions/:id/cancel` | Cancel lot (Auctioneer/Admin) |
| POST | `/auctions/:id/end` | End lot and create settlement |
| POST | `/auctions/:id/bids` | Place bid |
| GET | `/auctions/admin/all` | List all lots (Admin) |
| PUT | `/auctions/:id/status` | Override lot status (Admin) |

### Bids
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/bids` | List my bids |
| GET | `/bids/:id` | Get bid details |
| GET | `/bids/admin/all` | List all bids (Admin) |

> Bids are immutable once placed. Changing a bid creates a new `Bid` entry and a new link in the audit chain.

### Wallets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/wallets` | Balance, reserved amount and recent movements |
| GET | `/wallets/transactions` | List transactions |
| POST | `/wallets/deposit` | Deposit funds |
| POST | `/wallets/withdraw` | Withdraw available funds |
| GET | `/wallets/admin/all` | List all wallets (Admin) |
| GET | `/wallets/admin/:userId` | Wallet by user (Admin) |

### Settlements
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/settlements/public/:token` | Public receipt by `publicToken` |
| GET | `/settlements` | My settlements (buyer or seller) |
| GET | `/settlements/:id` | Settlement details |
| POST | `/settlements/:id/process` | Move settlement to `PROCESSING` |
| GET | `/settlements/admin/all` | List all settlements (Admin) |
| POST | `/settlements/admin/lots/:lotId` | Create settlement for a lot (Admin) |
| POST | `/settlements/admin/:id/complete` | Debit buyer, credit seller (Admin) |
| POST | `/settlements/admin/:id/fail` | Fail settlement and release funds (Admin) |

### Audit (Admin)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/audit` | List audit entries |
| GET | `/audit/bids/:bidId` | Audit entry of a bid |
| GET | `/audit/lots/:lotId` | Full chain of a lot |
| GET | `/audit/lots/:lotId/verify` | Recompute and verify the chain |

## 🔌 WebSocket Events

Connect with `auth.token` (JWT access token) in the handshake.

### Client → Server
```javascript
socket.emit('auction:join', lotId);
socket.emit('auction:leave', lotId);
```

### Server → Client
```javascript
socket.on('auction:state', (data) => { ... });        // initial state on join
socket.on('bid:new', (data) => { ... });              // new bid
socket.on('auction:status_change', (data) => { ... }); // lifecycle change
socket.on('auction:ended', (data) => { ... });        // lot closed
socket.on('auction:timer', (data) => { ... });        // countdown
```

## 📝 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Run migrations (dev) |
| `npm run prisma:migrate:prod` | Run migrations (prod) |
| `npm run prisma:studio` | Open Prisma Studio |
| `npm run prisma:seed` | Seed database |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint errors |

## 🐳 Docker

```bash
# Database only
docker-compose up -d postgres

# Full stack
docker-compose up -d --build

# Stop all
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

## 🔧 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment | development |
| `API_PREFIX` | API route prefix | /api/v1 |
| `JWT_SECRET` | JWT signing secret | Required |
| `JWT_EXPIRES_IN` | Access token expiry | 15m |
| `JWT_REFRESH_SECRET` | Refresh token secret | Required |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry | 7d |
| `CORS_ORIGIN` | CORS allowed origin | http://localhost:3001 |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | 900000 |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | 100 |
| `SOCKET_IO_CORS_ORIGIN` | Socket.io allowed origin | http://localhost:3001 |

## 📦 Test Credentials (after seeding)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@aurebid.com | admin123 |
| Auctioneer | auctioneer@aurebid.com | auctioneer123 |
| Bidder | bidder@aurebid.com | bidder123 |
| Bidder 2 | bidder2@aurebid.com | bidder123 |

Seeded lots: `lot-001` (ACTIVE, 3 bids), `lot-002` (SCHEDULED), `lot-003` (DRAFT) and `lot-004` (SETTLED with receipt `REC-2026-0001`).

## 📄 License

MIT
