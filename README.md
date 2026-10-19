# Agent Sandbox

Code-interpreter sandbox: run untrusted model-written JavaScript in a locked-down vm context with timeouts and captured logs.

TypeScript package `agent-sandbox`.

## Install

```sh
npm install github:theAliCanAcar/agent-sandbox#main
```

## How to use

```ts
import { createSandbox, codeInterpreterTool } from 'agent-sandbox';

const run = createSandbox({ timeoutMs: 500 });
console.log(await run('return 2 + 2'));
const tool = codeInterpreterTool({ timeoutMs: 500 });
console.log(await tool.execute({ code: 'return 40 + 2' }, {}));
```

## Use cases

### 1. Run model-written JS safely

- **Scenario:** The model proposes code to compute a result.
- **Outcome:** codeInterpreterTool/createSandbox executes it with timeout and captured logs.

### 2. Reject long-running scripts

- **Scenario:** Generated code loops forever.
- **Outcome:** Sandbox timeout returns a controlled failure instead of hanging the agent.

## Dependencies

- `agent-tools`: `github:theAliCanAcar/agent-tools#main`
- `zod`: `^3.23.8`

## Scripts

```sh
npm install
npm run build
```

## Notes

- Keep API keys in environment variables or a gitignored `.env`. Never commit secrets.
- Side-effecting tools should go through approval when used with `agent-approval`.
- Related packages live in separate repositories under [theAliCanAcar](https://github.com/theAliCanAcar).

## License

MIT
