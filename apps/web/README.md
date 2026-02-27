# KSU CSOS Web Application

Frontend application for the KSU College Sports Operating System (CSOS) - Revenue Intelligence Engine.

## Tech Stack

- **React 18** - UI framework
- **TypeScript 5** - Type safety
- **Vite 5** - Build tool and dev server
- **React Router v6** - Client-side routing
- **Supabase JS Client** - Backend integration
- **Recharts** - Data visualization

## Project Structure

```
apps/web/
├── src/
│   ├── app/               # App shell and routing
│   │   └── routes.tsx     # Route definitions
│   ├── features/          # Feature modules (dashboard, gifts, ticketing, etc.)
│   ├── components/        # Shared UI components
│   ├── services/          # API service layer
│   ├── hooks/             # React hooks
│   ├── lib/               # Config, supabase client, utilities
│   ├── types.ts           # TypeScript type definitions
│   ├── App.tsx            # Root component
│   ├── App.css            # App-specific styles
│   ├── main.tsx           # React entry point
│   └── index.css          # Global styles
├── public/                # Static assets
├── index.html             # HTML entry point
├── vite.config.ts         # Vite configuration
├── tsconfig.json          # TypeScript config
├── tsconfig.node.json     # TypeScript config for Node tools
├── .eslintrc.json         # ESLint config
└── package.json           # Dependencies and scripts
```

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- Supabase project configured (local or cloud)

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase credentials:
# VITE_SUPABASE_URL=your-project-url
# VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Development

```bash
# Start dev server (http://localhost:3000)
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint
```

### Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## Path Aliases

The project uses path aliases for cleaner imports:

```typescript
import { Button } from '@components/Button'
import { constituentService } from '@services/constituentService'
import { useAuth } from '@hooks/useAuth'
import { Constituent } from '@/types'
```

Available aliases:
- `@/` → `src/`
- `@components/` → `src/components/`
- `@features/` → `src/features/`
- `@services/` → `src/services/`
- `@hooks/` → `src/hooks/`
- `@lib/` → `src/lib/`

## Environment Variables

Create a `.env` file in the root with:

```env
# Supabase configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Optional: LLM provider for voice console (if using client-side)
VITE_OPENAI_API_KEY=sk-...
```

**Note:** Prefix all environment variables with `VITE_` to expose them to the client.

## Features

### Implemented Routes

- `/login` - Authentication page (Task 13)
- `/dashboard` - Executive dashboard (Task 14)
- `/major-gifts` - Major gifts module (Task 15)
- `/ticketing` - Ticketing module (Task 16)
- `/corporate` - Corporate partnerships (Task 16)
- `/proposals` - Proposal management (Task 17)
- `/import` - Data import interface (Task 18)
- `/voice` - Voice console (Task 19)
- `/admin/roles` - Role administration (Task 13)

### Component Status

All routes currently render placeholder components. Full implementations coming in Tasks 13-19.

## Development Workflow

### Adding a New Feature

1. Create feature directory: `src/features/[feature-name]/`
2. Add main component: `[FeatureName].tsx`
3. Add route in `src/app/routes.tsx`
4. Create service in `src/services/[feature]Service.ts`
5. Add types in `src/types.ts`

### Creating a Service

```typescript
// src/services/exampleService.ts
import { supabase } from '@lib/supabase'
import { Example } from '@/types'

export const exampleService = {
  async getAll(): Promise<Example[]> {
    const { data, error } = await supabase
      .from('examples')
      .select('*')

    if (error) throw error
    return data
  },

  async getById(id: string): Promise<Example> {
    const { data, error } = await supabase
      .from('examples')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  }
}
```

### Using Hooks

```typescript
// Example: useAuth hook
import { useAuth } from '@hooks/useAuth'

function MyComponent() {
  const { user, loading, signIn, signOut } = useAuth()

  if (loading) return <div>Loading...</div>
  if (!user) return <div>Please sign in</div>

  return <div>Welcome, {user.email}</div>
}
```

## Code Style

- Use functional components with hooks
- Prefer TypeScript interfaces over types
- Use async/await for asynchronous code
- Keep components focused and single-purpose
- Extract business logic into services
- Use semantic HTML elements
- Follow BEM naming for CSS classes

## Testing

Tests will be added in Task 23. Framework: Vitest + React Testing Library.

## Deployment

Build output is in `dist/` directory. Deploy to:
- Vercel (recommended)
- Netlify
- AWS S3 + CloudFront
- Any static hosting service

### Vite Build Configuration

The build is optimized for:
- Code splitting by route
- Tree shaking
- Minification
- Source maps (dev only)

## Troubleshooting

### "Module not found" errors

Check that path aliases match in both `vite.config.ts` and `tsconfig.json`.

### Supabase connection issues

1. Verify environment variables are set correctly
2. Check Supabase project is running
3. Ensure anon key has correct permissions

### TypeScript errors

Run `npm run type-check` to see all type errors. Fix before committing.

## Contributing

See main project README for contribution guidelines.

## License

Proprietary - Kansas State University Athletics
