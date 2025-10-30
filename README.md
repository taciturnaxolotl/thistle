# Thistle

> [!IMPORTANT]
> This is crazy pre-alpha and is changing really rapidly. Stuff should stabilize eventually but probably not for a month or two.

```bash
.
├── public
├── src
│   ├── components
│   ├── pages
│   └── styles
└── whisper-server
    ├── main.py
    ├── requirements.txt
    └── README.md

9 directories, 3 files
```

## What's this?

Thistle is a transcription service I'm building for Cedarville's startup competition! I'm also using it as an opportunity to become more familar with web components and full stack applications.

## How do I hack on it?

### Development

I'm just running this locally for now but getting started is super straightforward.

```bash
bun install
bun dev
```

Your server will be running at `http://localhost:3000` with hot module reloading. Just edit any `.ts`, `.html`, or `.css` file and watch it update in the browser.

### Transcription Service

Thistle requires a separate Whisper transcription server for audio processing. Set it up in the `whisper-server/` directory:

```bash
cd whisper-server
./run.sh
```

Or manually:
```bash
cd whisper-server
pip install -r requirements.txt
python main.py
```

The Whisper server will run on `http://localhost:8000`. Make sure it's running before using transcription features.

### Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
# Edit .env to set WHISPER_SERVICE_URL=http://localhost:8000
```

The tech stack is pretty minimal on purpose. Lit components (~8-10KB gzipped) for things that need reactivity, vanilla JS for simple stuff, and CSS variables for theming. The goal is to keep the total JS bundle as small as possible.

## How does it work?

The development flow is really nice in my opinion. The server imports HTML files as route handlers. Those HTML files import TypeScript components using `<script type="module">`. The components are just Lit web components that self-register as custom elements. Bun sees all this and bundles everything automatically including linked images or assets from the public directory.

```typescript
// src/index.ts - Server imports HTML as routes
import indexHTML from "./pages/index.html";

Bun.serve({
  port: 3000,
  routes: {
    "/": indexHTML,
  },
  development: {
    hmr: true,
    console: true,
  },
});
```

```html
<!-- src/pages/index.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <link rel="stylesheet" href="../styles/main.css" />
  </head>
  <body>
    <counter-component></counter-component>
    <script type="module" src="../components/counter.ts"></script>
  </body>
</html>
```

```typescript
// src/components/counter.ts
import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("counter-component")
export class CounterComponent extends LitElement {
  @property({ type: Number }) count = 0;

  static styles = css`
    :host {
      display: block;
      padding: 1rem;
    }
  `;

  render() {
    return html`
      <div>${this.count}</div>
      <button @click=${() => this.count++}>+</button>
    `;
  }
}
```

Oh last two points. Please please please use standard commits for my sanity and report any issues to [the tangled repo](https://tangled.org/dunkirk.sh/thistle)

<p align="center">
	<img src="https://raw.githubusercontent.com/taciturnaxolotl/carriage/master/.github/images/line-break.svg" />
</p>

<p align="center">
	&copy 2025-present <a href="https://github.com/taciturnaxolotl">Kieran Klukas</a>
</p>

<p align="center">
	<a href="https://github.com/taciturnaxolotl/thistle/blob/main/LICENSE.md"><img src="https://img.shields.io/static/v1.svg?style=for-the-badge&label=License&message=MIT&logoColor=d9e0ee&colorA=363a4f&colorB=b7bdf8"/></a>
</p>
