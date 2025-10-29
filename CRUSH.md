# Thistle - Project Guidelines

This is a Bun-based transcription service using the [Bun fullstack pattern](https://bun.com/docs/bundler/fullstack) for routing and bundled HTML.

## Project Info

- Name: Thistle
- Purpose: Transcription service
- Runtime: Bun (NOT Node.js)
- Language: TypeScript with strict mode
- Frontend: Vanilla HTML/CSS/JS with lightweight helpers on top of web components

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
<html>
  <head>
    <link rel="stylesheet" href="./styles.css">
  </head>
  <body>
    <h1>Hello, world!</h1>
    <my-component></my-component>
    <script type="module" src="./frontend.ts"></script>
  </body>
</html>
```

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

```ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

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

## Future Additions

As the codebase grows, document:
- Database schema and migrations
- API endpoint patterns
- Authentication/authorization approach
- Transcription service integration details
- Deployment process
- Environment variables needed
