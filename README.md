<h1 align="center">⚡ uFiber</h1>

> **⚠️ EXPERIMENTAL**: This project is currently in experimental stage and under active development. The API may change without notice. Not recommended for production use yet.

## Installation

```bash
# npm package manager
npm install ufiber
# pnpm package manager
pnpm add ufiber
# yarn package manager
yarn add ufiber
```

## Quick Start

```typescript
import {Fiber} from 'ufiber';

const app = new Fiber();

app.get('/', ctx => {
  return ctx.text('Hello, uFiber!');
});

app.get('/json', ctx => {
  return ctx.json({message: 'Fast and simple!'});
});

app.listenTcp(3000);
```
