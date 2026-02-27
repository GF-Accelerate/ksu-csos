# KSU College Sports Operating System (CSOS)

## Phase 1: Revenue Intelligence Engine

A unified constituent data platform for KSU's athletic department that provides intelligent routing, scoring, and proposal generation across ticketing, major gifts, and corporate partnerships.

## Features

- **Unified Constituent Database**: Single source of truth for donors, ticket holders, and corporate partners
- **Intelligent Routing**: Automated opportunity assignment with collision prevention
- **AI-Powered Scoring**: Renewal risk, ask readiness, and propensity modeling
- **Proposal Generation**: AI-assisted proposal drafting with approval workflows
- **Voice Console**: Voice-enabled command interface for executives
- **Role-Based Access**: Enterprise-grade security with Row-Level Security (RLS)

## Tech Stack

- **Backend**: Supabase (PostgreSQL + Edge Functions + Auth)
- **Frontend**: React + Vite + TypeScript
- **Auth**: JWT-based (Supabase Auth) with SSO-ready architecture
- **Rules**: YAML-based routing, collision, and approval logic
- **AI**: OpenAI/Claude via Edge Functions

## Project Structure

```
ksu-csos/
├── apps/web/              # React frontend
├── supabase/              # Database migrations & Edge Functions
├── packages/              # Shared rules and prompts
├── docs/                  # Documentation
└── .github/workflows/     # CI/CD
```

## Getting Started

### Prerequisites

- Node.js 18+
- Docker (for local Supabase)
- Supabase CLI
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd ksu-csos
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your Supabase and API keys
   ```

3. **Start local Supabase**
   ```bash
   supabase start
   ```

4. **Apply database migrations**
   ```bash
   supabase db reset
   ```

5. **Install frontend dependencies**
   ```bash
   cd apps/web
   npm install
   ```

6. **Start development server**
   ```bash
   npm run dev
   ```

7. **Deploy Edge Functions (optional - local development)**
   ```bash
   cd ../../
   supabase functions deploy
   ```

## Development

### Running locally

```bash
# Start Supabase (in one terminal)
supabase start

# Start frontend (in another terminal)
cd apps/web
npm run dev
```

### Running tests

```bash
# Edge Function tests
cd supabase/functions
deno test --allow-all

# Frontend tests
cd apps/web
npm test
```

### Deploying

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for production deployment instructions.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system architecture details.

## API Documentation

See [docs/API.md](docs/API.md) for Edge Function API reference.

## License

Proprietary - KSU Athletics Department

## Support

For issues or questions, contact the Revenue Operations team.
