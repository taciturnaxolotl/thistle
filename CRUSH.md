# Thistle - Project Guidelines

This is a Bun-based transcription service using the [Bun fullstack pattern](https://bun.com/docs/bundler/fullstack) for routing and bundled HTML.

## Workflow

**IMPORTANT**: Do NOT commit changes until the user explicitly asks you to commit. Always wait for user verification that changes are working correctly before making commits.

## Project Info

- Name: Thistle
- Purpose: Transcription service
- Runtime: Bun (NOT Node.js)
- Language: TypeScript with strict mode
- Frontend: Vanilla HTML/CSS/JS with lightweight helpers on top of web components

## Design System

ALWAYS use the project's CSS variables for colors:

```css
:root {
  /* Color palette */
  --gunmetal: #2d3142ff;    /* dark blue-gray */
  --paynes-gray: #4f5d75ff; /* medium blue-gray */
  --silver: #bfc0c0ff;      /* light gray */
  --white: #ffffffff;       /* white */
  --coral: #ef8354ff;       /* warm orange */

  /* Semantic color assignments */
  --text: var(--gunmetal);
  --background: var(--white);
  --primary: var(--paynes-gray);
  --secondary: var(--silver);
  --accent: var(--coral);
}
```

**Color usage:**
- NEVER hardcode colors like `#4f46e5`, `white`, `red`, etc.
- Always use semantic variables (`var(--primary)`, `var(--background)`, `var(--accent)`, etc.) or named color variables (`var(--gunmetal)`, `var(--coral)`, etc.)

**Dimensions:**
- Use `rem` for all sizes, spacing, and widths (not `px`)
- Base font size is 16px (1rem = 16px)
- Common values: `0.5rem` (8px), `1rem` (16px), `2rem` (32px), `3rem` (48px)
- Max widths: `48rem` (768px) for content, `56rem` (896px) for forms/data
- Spacing scale: `0.25rem`, `0.5rem`, `0.75rem`, `1rem`, `1.5rem`, `2rem`, `3rem`

## NO FRAMEWORKS

NEVER use React, Vue, Svelte, or any heavy framework.

This project prioritizes:
- Speed: Minimal JavaScript, fast load times
- Small bundle sizes: Keep bundles tiny
- Native web platform: Use web standards (Web Components, native DOM APIs)
- Simplicity: Vanilla HTML, CSS, and JavaScript

Allowed lightweight helpers:
- Lit (~8-10KB gzipped) for reactive web components
- Native Web Components
- Plain JavaScript/TypeScript

Explicitly forbidden:
- React, React DOM
- Vue
- Svelte
- Angular
- Any framework with a virtual DOM or large runtime

## Commands

```bash
# Install dependencies
bun install

# Development server with hot reload
bun dev

# Run tests
bun test

# Build files
bun build <file.html|file.ts|file.css>

# Make a user an admin
bun scripts/make-admin.ts <email>
```

Development workflow: `bun dev` runs the server with hot module reloading. Changes to TypeScript, HTML, or CSS files automatically reload.

**IMPORTANT**: NEVER run `bun dev` yourself - the user always has it running already.

## Bun Usage

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>`
- Bun automatically loads .env, so don't use dotenv

## Bun APIs

Use Bun's built-in APIs instead of npm packages:

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- `Bun.$\`ls\`` instead of execa

## Server Setup

Use `Bun.serve()` with the routes pattern:

```ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

## Frontend Pattern

Don't use Vite or any build tools. Use HTML imports with `Bun.serve()`.

HTML files can directly import `.ts` or `.js` files:

```html
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Title - Thistle</title>
  <link rel="icon"
    href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>🪻</text></svg>">
  <link rel="stylesheet" href="../styles/main.css">
</head>

<body>
  <auth-component></auth-component>
  
  <main>
    <h1>Page Title</h1>
    <my-component></my-component>
  </main>

  <script type="module" src="../components/auth.ts"></script>
  <script type="module" src="../components/my-component.ts"></script>
</body>

</html>
```

**Standard HTML template:**
- Always include the `<auth-component>` element for consistent login/logout UI
- Always include the thistle emoji favicon
- Always include proper meta tags (charset, viewport)
- Structure: auth component, then main content, then scripts
- Import `auth.ts` on every page for authentication UI

Bun's bundler will transpile and bundle automatically. `<link>` tags pointing to stylesheets work with Bun's CSS bundler.

Frontend TypeScript (vanilla or with Lit web components):

```ts
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

// Define a Lit web component
@customElement('my-component')
export class MyComponent extends LitElement {
  @property({ type: String }) name = 'World';

  // Scoped styles using css tagged template
  static styles = css`
    :host {
      display: block;
      padding: 1rem;
    }
    .greeting {
      color: blue;
    }
  `;

  // Render using html tagged template
  render() {
    return html`
      <div class="greeting">
        Hello, ${this.name}!
      </div>
    `;
  }
}

// Or use plain DOM manipulation for simple interactions
document.querySelector('h1')?.addEventListener('click', () => {
  console.log('Clicked!');
});
```

**When to use Lit:**
- Components with reactive properties (auto-updates when data changes)
- Complex components needing scoped styles
- Form controls with internal state
- Components with lifecycle needs

**When to skip Lit:**
- Static content (use plain HTML)
- Simple one-off interactions (use vanilla JS)
- Anything without reactive state

Lit provides:
- `@customElement` decorator to register components
- `@property` decorator for reactive properties  
- `html` tagged template for declarative rendering
- `css` tagged template for scoped styles
- Automatic re-rendering when properties change
- Size: ~8-10KB minified+gzipped

## Testing

Use `bun test` to run tests.

### Basic Test Structure

```ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

### Test File Naming

- Place tests next to the code they test: `foo.ts` → `foo.test.ts`
- This keeps tests close to implementation for easy maintenance
- Bun automatically discovers `*.test.ts` files

### Writing Good Tests

**Test security-critical code:**
- File path operations (directory traversal, injection)
- User input validation
- Authentication/authorization
- API endpoint security

**Test edge cases:**
- Empty strings, null, undefined
- Very large inputs (size limits)
- Invalid formats
- Boundary conditions

**Test async operations:**
```ts
test("async function", async () => {
  const result = await someAsyncFunction();
  expect(result).toBe("expected value");
});
```

**Test error conditions:**
```ts
test("rejects invalid input", async () => {
  await expect(dangerousFunction("../../../etc/passwd")).rejects.toThrow();
  await expect(dangerousFunction("invalid")).rejects.toThrow("Invalid format");
});
```

**Example: Security-focused tests**
```ts
test("prevents directory traversal", async () => {
  const maliciousIds = [
    "../../../etc/passwd",
    "../../secret.txt",
    "test/../../../config",
  ];

  for (const id of maliciousIds) {
    await expect(loadFile(id)).rejects.toThrow();
  }
});

test("validates input format", async () => {
  const invalidInputs = [
    "test; rm -rf /",
    "test`whoami`",
    "test\x00null",
  ];

  for (const input of invalidInputs) {
    await expect(processInput(input)).rejects.toThrow("Invalid format");
  }
});
```

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test src/lib/auth.test.ts

# Watch mode (re-run on changes)
bun test --watch
```

### What to Test

**Always test:**
- Security-critical functions (file I/O, user input)
- Complex business logic
- Edge cases and error handling
- Public API functions

**Don't need to test:**
- Simple getters/setters
- Framework/library code
- UI components (unless complex logic)
- One-line utility functions

## TypeScript Configuration

Strict mode is enabled with these settings:

```json
{
  "strict": true,
  "noFallthroughCasesInSwitch": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true
}
```

Deliberately disabled:
- `noUnusedLocals`: false
- `noUnusedParameters`: false  
- `noPropertyAccessFromIndexSignature`: false

Module system:
- `moduleResolution`: "bundler"
- `module`: "Preserve"
- JSX: `preserve` (NOT react-jsx - we don't use React)
- Allows importing `.ts` extensions directly

## Frontend Technologies

Core (always use):
- Vanilla HTML, CSS, JavaScript/TypeScript
- Native Web Components API
- Native DOM APIs (querySelector, addEventListener, etc.)

Lightweight helpers:
- Lit (~8-10KB gzipped): For reactive web components with state management

Bundle size philosophy:
- Start with vanilla JS
- Add helpers only when they significantly reduce complexity
- Measure bundle size impact before adding any library
- Target: Keep total JS bundle under 50KB

## Project Structure

Based on Bun fullstack pattern:
- `src/index.ts`: Server imports HTML files as modules
- `src/pages/`: HTML files (route entry points)
- `src/components/`: Lit web components
- `src/styles/`: CSS files
- `public/`: Static assets (images, fonts, etc.)

**File flow:**
1. Server imports HTML: `import indexHTML from "./pages/index.html"`
2. HTML imports components: `<script type="module" src="../components/counter.ts"></script>`
3. HTML links styles: `<link rel="stylesheet" href="../styles/main.css">`
4. Components self-register as custom elements
5. Bun bundles everything automatically

## Database Schema & Migrations

Database migrations are managed in `src/db/schema.ts` using a versioned migration system.

**Migration structure:**
```typescript
const migrations = [
  {
    version: 1,
    name: "Description of migration",
    sql: `
      CREATE TABLE IF NOT EXISTS ...;
      CREATE INDEX IF NOT EXISTS ...;
    `,
  },
];
```

**Important migration rules:**
1. **Never modify existing migrations** - they may have already run in production
2. **Always add new migrations** with incrementing version numbers
3. **Drop indexes before dropping columns** - SQLite will error if you try to drop a column with an index still attached
4. **Use IF NOT EXISTS** for CREATE statements to be idempotent
5. **Test migrations** on a copy of production data before deploying

**Example: Dropping a column**
```sql
-- ❌ WRONG: Will error if idx_users_old_column exists
ALTER TABLE users DROP COLUMN old_column;

-- ✅ CORRECT: Drop index first, then column
DROP INDEX IF EXISTS idx_users_old_column;
ALTER TABLE users DROP COLUMN old_column;
```

**Migration workflow:**
1. Add migration to `migrations` array with next version number
2. Migrations auto-apply on server start
3. Check `schema_migrations` table to see applied versions
4. Migrations are transactional and show timing in console

## File Organization

- `src/index.ts`: Main server entry point with `Bun.serve()` routes
- `src/pages/*.html`: Route entry points (imported as modules)
- `src/components/*.ts`: Lit web components
- `src/styles/*.css`: Stylesheets (linked from HTML)
- `public/`: Static assets directory
- Tests: `*.test.ts` files

**Current structure example:**
```
src/
  index.ts              # Imports HTML, defines routes
  pages/
    index.html          # Imports components via <script type="module">
  components/
    counter.ts          # Lit component with @customElement
  styles/
    main.css            # Linked from HTML with <link>
```

## Naming Conventions

Follow TypeScript conventions:
- PascalCase for components and classes
- camelCase for functions and variables
- kebab-case for file names

## Development Workflow

1. Make changes to `.ts`, `.html`, or `.css` files
2. Bun's HMR automatically reloads changes
3. Write tests in `*.test.ts` files
4. Run `bun test` to verify

## IDE Setup

Biome LSP is configured in `crush.json` for linting and formatting support.

## Common Tasks

### Adding a new route
Add to the `routes` object in `Bun.serve()` configuration

### Adding a new page
Create an HTML file, import it in the server, add to routes

### Adding frontend functionality
Import TS/JS files directly from HTML using `<script type="module" src="../components/my-component.ts"></script>`. Use Lit for reactive components or vanilla JS for simple interactions. Never React.

### Adding WebSocket support
Add `websocket` configuration to `Bun.serve()`

## Important Notes

1. No npm scripts needed: Bun is fast enough to run commands directly
2. Private package: `package.json` has `"private": true`
3. No build step for development: Hot reload handles everything
4. Module type: Package uses `"type": "module"` (ESM)
5. Bun types: Available via `@types/bun` (check `node_modules/bun-types/docs/**.md` for API docs)

## Gotchas

1. Don't use Node.js commands: Use `bun` instead of `node`, `npm`, `npx`, etc.
2. Don't install Express/Vite/other tools: Bun has built-in equivalents
3. NEVER EVER use React: This project is vanilla JS/TS with web components only. React is explicitly forbidden.
4. Import .ts extensions: Bun allows importing `.ts` files directly
5. No dotenv needed: Bun loads `.env` automatically
6. HTML imports are special: They trigger Bun's bundler, don't treat them as static files
7. Bundle size matters: Always consider the size impact before adding any library

## Documentation Lookup

Use Context7 MCP for looking up official documentation for libraries and frameworks.

## Resources

- [Bun Fullstack Documentation](https://bun.com/docs/bundler/fullstack)
- [Lit Documentation](https://lit.dev/)
- [Web Components MDN](https://developer.mozilla.org/en-US/docs/Web/Web_Components)
- Bun API docs in `node_modules/bun-types/docs/**.md`

## Admin System

The application includes a role-based admin system for managing users and transcriptions.

**User roles:**
- `user` - Default role, can create and manage their own transcriptions
- `admin` - Full administrative access to all data and users

**Admin privileges:**
- View all transcriptions (with user info, status, errors)
- Delete transcriptions
- View all users (with emails, join dates, roles)
- Change user roles (user ↔ admin)
- Delete user accounts
- Access admin dashboard at `/admin`

**Making users admin:**
Use the provided script to grant admin access:
```bash
bun scripts/make-admin.ts user@example.com
```

**Admin routes:**
- `/admin` - Admin dashboard (protected by `requireAdmin` middleware)
- `/api/admin/transcriptions` - Get all transcriptions with user info
- `/api/admin/transcriptions/:id` - Delete a transcription (DELETE)
- `/api/admin/users` - Get all users
- `/api/admin/users/:id` - Delete a user account (DELETE)
- `/api/admin/users/:id/role` - Update a user's role (PUT)

**Admin UI features:**
- Statistics cards (total users, total/failed transcriptions)
- Tabbed interface (Pending Recordings / Transcriptions / Users / Classes)
- Status badges for transcription states
- Delete buttons for transcriptions with confirmation
- Role dropdown for changing user roles
- Delete buttons for user accounts with confirmation
- User avatars and info display
- Timestamp formatting
- Admin badge on user listings
- Query parameter support for direct tab navigation (`?tab=<tabname>`)

**Admin tab navigation:**
- `/admin` - Opens to default "pending" tab
- `/admin?tab=pending` - Pending recordings tab
- `/admin?tab=transcriptions` - All transcriptions tab
- `/admin?tab=users` - Users management tab
- `/admin?tab=classes` - Classes management tab
- URL updates when switching tabs (browser history support)

**Implementation notes:**
- `role` column in users table ('user' or 'admin', default 'user')
- `requireAdmin()` middleware checks authentication + admin role
- Returns 403 if non-admin tries to access admin routes
- Admin link shows in auth menu only for admin users
- Redirects to home page if non-admin accesses admin page

## Subscription System

The application uses Polar for subscription management to gate access to transcription features.

**Subscription requirement:**
- Users must have an active subscription to upload and transcribe audio files
- Users can join classes and request classes without a subscription
- Admins bypass subscription requirements

**Protected routes:**
- `POST /api/transcriptions` - Upload audio file (requires subscription or admin)
- `GET /api/transcriptions` - List user's transcriptions (requires subscription or admin)
- `GET /api/transcriptions/:id` - Get transcription details (requires subscription or admin)
- `GET /api/transcriptions/:id/audio` - Download audio file (requires subscription or admin)
- `GET /api/transcriptions/:id/stream` - Real-time transcription updates (requires subscription or admin)

**Open routes (no subscription required):**
- All authentication endpoints (`/api/auth/*`)
- Class search and joining (`/api/classes/search`, `/api/classes/join`)
- Waitlist requests (`/api/classes/waitlist`)
- Billing/subscription management (`/api/billing/*`)

**Subscription statuses:**
- `active` - Full access to transcription features
- `trialing` - Trial period, full access
- `past_due` - Payment failed but still has access (grace period)
- `canceled` - No access to transcription features
- `expired` - No access to transcription features

**Implementation:**
- `subscriptions` table tracks user subscriptions from Polar
- `hasActiveSubscription(userId)` checks for active/trialing/past_due status
- `requireSubscription()` middleware enforces subscription requirement
- `/api/auth/me` returns `has_subscription` boolean
- Webhook at `/api/webhooks/polar` receives subscription updates from Polar
- Frontend components check `has_subscription` and show subscribe prompt

**User settings with query parameters:**
- Settings page supports `?tab=<tabname>` query parameter to open specific tabs
- Valid tabs: `account`, `sessions`, `passkeys`, `billing`, `danger`
- Example: `/settings?tab=billing` opens the billing tab directly
- Subscribe prompts link to `/settings?tab=billing` for direct access
- URL updates when switching tabs (browser history support)

**Testing subscriptions:**
Manually add a test subscription to the database:
```sql
INSERT INTO subscriptions (id, user_id, customer_id, status) 
VALUES ('test-sub', <user_id>, 'test-customer', 'active');
```

## Future Additions

As the codebase grows, document:
- Database schema and migrations
- API endpoint patterns
- Authentication/authorization approach
- Transcription service integration details
- Deployment process
- Environment variables needed

