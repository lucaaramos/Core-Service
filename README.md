# Core-Service — Home Services Marketplace (MVP)

![Go](https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white)
![Fiber](https://img.shields.io/badge/Fiber-v2-00ACD7?logo=go&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-Alpine-009639?logo=nginx&logoColor=white)
![Docker Compose](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

Full-stack multi-sided platform connecting **Clients** (`CLIENTE`) who need home services (plumbing, electrical work, gas fitting, locksmithing, etc.) with skilled **Contractors / Technicians** (`OPERARIO`) and platform **Administrators** (`ADMIN`), managing the end-to-end lifecycle, traceability, and concurrency of every service **Ticket**.

---

## Tech Stack

* **Backend (`core-service`):** Go 1.26, Fiber v2, `database/sql` + `lib/pq` (explicit SQL queries without heavy ORMs).
* **Database & Migrations:** PostgreSQL 15 Alpine, `golang-migrate` (`migrate/migrate:v4.18.3`).
* **Authentication & Security:** `HS256`-signed JWT (`golang-jwt/jwt/v5`) + `bcrypt` password hashing.
* **Frontend (`frontend/`):** React 19, Vite 8, TypeScript, React Router v7, Tailwind CSS v4.
* **Infrastructure & Deployment:** Multi-stage Docker builds (non-root static Go binary + Nginx Alpine for SPA) orchestrated via Docker Compose.

---

## Architecture & Technical Decisions

![Architecture Diagram](core-service.drawio.png)

### Backend (`core-service`)
* **Modular Clean Architecture:** All business logic lives under `internal/` split by bounded domain (`auth`, `service`, `ticket`). Each module strictly separates `domain` (entities, domain errors, and repository interfaces), `usecase` (business rules), `infrastructure` (PostgreSQL implementation), and `delivery/http` (Fiber handlers and route registration).
* **Configuration & Lifecycle:** Centralized configuration in `internal/config` with parameterized CORS (explicit origin allowlist compatible with credentials) and **Graceful Shutdown** on `SIGINT`/`SIGTERM` signals, cleanly draining HTTP connections and closing the SQL connection pool.

### Security & Consistency
* **RBAC (Role-Based Access Control):** `JWTProtected` and `RequireRole` middlewares verify token signatures, expiration, and role permissions (`CLIENTE`, `OPERARIO`, `ADMIN`).
* **IDOR Mitigation:** Use cases enforce resource membership before returning ticket details, advancing states, completing jobs, or cancelling tickets (restricted to the owning client, the assigned contractor, or an `ADMIN`, depending on the action).
* **Strict State Machine:** Intermediate state transitions (`ASIGNADO → EN_CAMINO → EN_PROGRESO`) are decoupled from job completion (`POST /finalizar`, which requires final price and payment method) and cancellation (`PATCH /cancelar`).
* **Atomic Database-Level Concurrency Control:**
  * **Race-free job assignment (`PATCH /tickets/:id/asignar`):** Executes an atomic `UPDATE ... WHERE id = $3 AND estado = 'CREADO'`. If multiple contractors attempt to claim the same job simultaneously, PostgreSQL guarantees a single winner (`200 OK`) and returns `409 Conflict` to everyone else.
  * **Atomic completion (`POST /tickets/:id/finalizar`):** Persists `precio_final`, `metodo_pago`, `evidencia_url`, and transitions to `FINALIZADO` in a single conditional statement (`WHERE id = $5 AND estado = 'EN_PROGRESO'`).

### Frontend (`frontend/`)
* **React + TypeScript SPA:** Role-specific dashboards (`/cliente`, `/operario`, `/admin`) guarded by `ProtectedRoute`, with automatic role-based redirection at `/` derived from JWT claims.
* **Centralized HTTP Client:** Typed `fetch` wrapper (`ApiError` exposing HTTP status codes to handle scenarios like `409 Conflict` in the job board) with automatic `401 Unauthorized` interception to clear expired sessions and redirect to `/login`.
* **Multi-stage Build + Nginx:** Production bundle compiled with Node 20 and served by `nginx:alpine` configured with `gzip` compression, immutable caching for `/assets/`, and `try_files $uri $uri/ /index.html` SPA fallback for client-side React Router routes.

### Project Structure

```text
.
├── cmd/
│   └── api/
│       └── main.go                 # Entrypoint, dependency wiring, and graceful shutdown
├── db/
│   └── migrations/                 # SQL migrations (up/down) for users, services, and tickets
├── documents/
│   └── swagger.yml                 # OpenAPI 3.0.3 contract (v1.3.0)
├── internal/
│   ├── auth/                       # User domain, registration, and JWT login
│   ├── config/                     # Safe environment & CORS configuration loader
│   ├── middleware/                 # JWTProtected and RequireRole Fiber middlewares
│   ├── service/                    # Service catalog domain
│   └── ticket/                     # Core business domain: job board, assignment, states, and closing
├── frontend/
│   ├── src/
│   │   ├── api/                    # Typed HTTP client and auth, services, and tickets modules
│   │   ├── components/             # Navbar, StatusBadge, ProtectedRoute, RoleRedirect
│   │   ├── context/                # AuthContext and JWT session management
│   │   ├── pages/                  # Login, Register, and Dashboards (Cliente, Operario, Admin)
│   │   ├── types/                  # TypeScript contracts aligned with OpenAPI
│   │   └── utils/                  # JWT decoding and currency/date formatting helpers
│   ├── Dockerfile                  # Multi-stage build (Node 20 -> Nginx Alpine)
│   └── nginx.conf                  # SPA fallback, gzip compression, and static asset caching
├── tests/
│   └── test_concurrence.js         # Concurrency race-condition test script
├── Dockerfile                      # Multi-stage Go backend build
├── docker-compose.yml              # Full-stack orchestration (postgres, migrate, api, frontend)
└── .env.example                    # Public environment variable template
```

---

## Quick Start with Docker Compose (Recommended)

### Prerequisites
* **Docker** (24+) and **Docker Compose** (v2+).

### Step-by-Step Setup

1. **Clone the repository and create your environment file:**

   ```bash
   git clone <REPOSITORY_URL>
   cd core-service
   cp .env.example .env
   ```

   > Edit `.env` and set strong values for `JWT_SECRET` and `POSTGRES_PASSWORD`.

2. **Start the full stack:**

   ```bash
   docker compose up --build -d
   ```

   This builds and starts all **4 services** in order:
   * `postgres` (`core_postgres`): PostgreSQL 15 database with persistent volume storage and healthcheck.
   * `migrate` (`core_migrate`): Automatically applies SQL migrations from `db/migrations/` once `postgres` is healthy, then exits.
   * `api` (`core_api`): Go REST API exposed on port `8080` after migrations succeed.
   * `frontend` (`core_frontend`): React production SPA served by Nginx on port `3000`.

3. **(Optional) Seed initial services into the catalog:**

   When starting from an empty database, you can populate the service catalog with:

   ```bash
   docker exec -i core_postgres psql -U postgres -d core_service_db << 'EOF'
   INSERT INTO services (nombre, descripcion, tarifa_base) VALUES
     ('Plomería', 'Reparación de cañerías, pérdidas e instalaciones sanitarias', 18000.00),
     ('Electricidad', 'Instalaciones eléctricas, tableros y cortocircuitos', 22000.00),
     ('Gasista Matriculado', 'Revisión de artefactos, pérdidas y habilitaciones', 25000.00),
     ('Cerrajería', 'Apertura de puertas y cambio de combinaciones', 15000.00)
   ON CONFLICT (nombre) DO NOTHING;
   EOF
   ```

### Access URLs

| Service | URL |
| :--- | :--- |
| **Frontend (SPA)** | [http://localhost:3000](http://localhost:3000) |
| **API Base URL** | `http://localhost:8080/api/v1` |
| **API Healthcheck** | [http://localhost:8080/health](http://localhost:8080/health) |

### Useful Commands

```bash
# Check container status
docker compose ps

# Follow backend logs in real time
docker compose logs -f api

# Follow frontend (Nginx) logs
docker compose logs -f frontend

# Stop containers while preserving database data
docker compose down

# Stop containers and remove the PostgreSQL volume (full reset)
docker compose down -v
```

---

## Local Development (Without Docker for App & Frontend)

To run the Go backend and Vite frontend directly on your host machine with hot-reload:

### Local Prerequisites
* **Go** 1.26+
* **Node.js** 20+ and **npm**
* **PostgreSQL** 15 running on `localhost:5432` (you can spin up just the database and migrations via `docker compose up -d postgres migrate`).

### 1. Run the Backend (Go)

Ensure your root `.env` file points to `POSTGRES_HOST=localhost`, then run:

```bash
go run cmd/api/main.go
```

The API will listen on `http://localhost:8080`.

### 2. Run the Frontend (Vite)

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Vite's development server will start at [http://localhost:5173](http://localhost:5173) (already whitelisted by default in `CORS_ALLOW_ORIGINS`).

---

## Roles, Workflow & Admin User

### Role Capabilities

* **`CLIENTE` (Client):** Browses the service catalog, submits new service requests, tracks the status and full details of their own tickets (including final price, payment method, and evidence link once completed), and can cancel active requests.
* **`OPERARIO` (Contractor):** Browses the **Job Board** (`CREADO`), claims jobs with atomic concurrency protection, advances assigned jobs (`EN_CAMINO` → `EN_PROGRESO`), completes jobs with final pricing and photo evidence (`FINALIZADO`), or cancels an assigned ticket if needed.
* **`ADMIN` (Administrator):** Supervises all platform tickets with global KPIs and cumulative revenue metrics, inspects any ticket's details, advances intermediate states (`ASIGNADO → EN_CAMINO → EN_PROGRESO`), and can cancel active tickets. *(Admins do not claim jobs from the board or submit operational completions).*

### Ticket State Machine

```text
                       ┌───────────────────────────────────────┐
                       ▼                                       │
[CREADO] ──(asignar)──► [ASIGNADO] ──► [EN_CAMINO] ──► [EN_PROGRESO] ──(finalizar)──► [FINALIZADO]
   │                       │               │                 │
   └───────────────────────┴───────────────┴─────────────────┴───────(cancelar)─────► [CANCELADO]
```

### Promoting a User to `ADMIN`

For security reasons, the public `POST /api/v1/auth/register` endpoint **only allows registering `CLIENTE` or `OPERARIO` accounts**. To create an administrator account:

1. Register a standard account through the UI (or API) with your email.
2. Promote the user to `ADMIN` in PostgreSQL:

   ```sql
   UPDATE users SET rol = 'ADMIN' WHERE email = 'admin@example.com';
   ```

   If running via Docker Compose, execute it in one command:

   ```bash
   docker exec -it core_postgres psql -U postgres -d core_service_db \
     -c "UPDATE users SET rol = 'ADMIN' WHERE email = 'admin@example.com';"
   ```

3. Log out and sign back in to receive a fresh JWT containing `"rol": "ADMIN"`.

---

## API Contract (OpenAPI 1.3.0)

Full request/response schemas, status codes, and examples are documented in [`documents/swagger.yml`](documents/swagger.yml).

| Method | Path | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Public | Service health check (`{"status": "UP"}`). |
| `POST` | `/api/v1/auth/register` | Public | Registers a new user with role `CLIENTE` or `OPERARIO`. |
| `POST` | `/api/v1/auth/login` | Public | Validates credentials and issues an `HS256` JWT (24h TTL). |
| `GET` | `/api/v1/services` | `CLIENTE`, `OPERARIO`, `ADMIN` | Lists the service catalog ordered by ID, including base rates. |
| `POST` | `/api/v1/tickets` | `CLIENTE` | Creates a new service ticket in `CREADO` state. |
| `GET` | `/api/v1/tickets` | `CLIENTE`, `OPERARIO`, `ADMIN` | Lists tickets visible to the caller's role (supports `?estado=`). |
| `GET` | `/api/v1/tickets/disponibles` | `OPERARIO` | Lists unassigned `CREADO` tickets on the job board. |
| `GET` | `/api/v1/tickets/{id}` | `CLIENTE`*, `OPERARIO`*, `ADMIN` | Returns full ticket details (*participants only). |
| `PATCH` | `/api/v1/tickets/{id}/asignar` | `OPERARIO` | Atomically assigns the ticket to the contractor (`409` if already taken). |
| `PATCH` | `/api/v1/tickets/{id}/estado` | `OPERARIO`*, `ADMIN` | Advances ticket state (`ASIGNADO → EN_CAMINO → EN_PROGRESO`). |
| `POST` | `/api/v1/tickets/{id}/finalizar` | `OPERARIO`* | Records final price, payment method, and evidence (`FINALIZADO`). |
| `PATCH` | `/api/v1/tickets/{id}/cancelar` | `CLIENTE`*, `OPERARIO`*, `ADMIN` | Cancels a ticket that is not yet `FINALIZADO` or `CANCELADO`. |

---

## Environment Variables

Copy [`.env.example`](.env.example) to `.env` in the project root. Never commit real credentials to Git.

| Variable | Purpose | Default Value (Local Dev) |
| :--- | :--- | :--- |
| `PORT` | Internal port on which the Go server listens | `8080` |
| `API_PORT` | Host port mapped to the `api` container in Docker Compose | `8080` |
| `JWT_SECRET` | Secret key used to sign and verify `HS256` JWT tokens | *(Required — set a long random string)* |
| `CORS_ALLOW_ORIGINS` | Comma-separated list of allowed CORS origins | `http://localhost:3000,http://localhost:5173` |
| `VITE_API_URL` | Base API URL embedded into the frontend bundle at build time (accessed from the host browser) | `http://localhost:8080/api/v1` |
| `POSTGRES_USER` | PostgreSQL username | `postgres` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `cambia_esta_password` |
| `POSTGRES_DB` | PostgreSQL database name | `core_service_db` |
| `POSTGRES_PORT` | Host port mapped to container port `5432` | `5432` |
| `POSTGRES_HOST` | PostgreSQL host when running `go run` outside Docker | `localhost` |
| `DATABASE_URL` | Full PostgreSQL DSN for local runs (overridden inside Docker Compose to point to `@postgres:5432`) | `postgres://postgres:cambia_esta_password@localhost:5432/core_service_db?sslmode=disable` |
