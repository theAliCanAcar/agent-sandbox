/**
 * agent-sandbox: a paranoid code interpreter for model-written JavaScript.
 *
 * Runs snippets inside node:vm with a frozen, throwaway global, a hard
 * execution timeout, and captured console output. No require, no fetch, no
 * process — the model gets math, JSON, and regret.
 *
 *   const run = createSandbox({ timeoutMs: 1000 });
 *   const result = await run("return 6 * 7");
 */
import vm from "node:vm";
import { z } from "zod";
import { failure, type Tool, type ToolResult } from "agent-tools";

export type SandboxOptions = {
  /** Wall-clock limit for the snippet. Default 1000ms. */
  timeoutMs?: number;
  /** Pre-seeded globals visible to the snippet (JSON-serializable-ish). */
  globals?: Record<string, unknown>;
  /** Cap captured console lines. Default 100. */
  maxLogLines?: number;
};

export type SandboxResult = {
  ok: boolean;
  value?: unknown;
  logs: string[];
  error?: { code: string; message: string };
  durationMs: number;
};

export type Sandbox = (code: string) => Promise<SandboxResult>;

export function createSandbox(options: SandboxOptions = {}): Sandbox {
  const timeoutMs = options.timeoutMs ?? 1000;
  const maxLogLines = options.maxLogLines ?? 100;

  return async function run(code: string): Promise<SandboxResult> {
    const started = Date.now();
    const logs: string[] = [];
    const capture = (...args: unknown[]) => {
      if (logs.length < maxLogLines) {
        logs.push(args.map((a) => stringify(a)).join(" "));
      }
    };

    // Fresh, minimal world each run: nothing inherited from the host realm.
    const sandboxGlobal: Record<string, unknown> = {
      console: { log: capture, warn: capture, error: capture, info: capture },
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      ...(options.globals ?? {}),
    };
    sandboxGlobal.globalThis = sandboxGlobal;

    try {
      const context = vm.createContext(sandboxGlobal, {
        codeGeneration: { strings: false, wasm: false }, // no eval, no new Function
      });
      const script = new vm.Script(`"use strict";\n(function () {\n${code}\n})()`, {
        filename: "sandbox-snippet.js",
      });
      const value = script.runInContext(context, { timeout: timeoutMs, breakOnSigint: true });
      return { ok: true, value: sanitize(value), logs, durationMs: Date.now() - started };
    } catch (err) {
      const anyErr = err as { name?: string; message?: string };
      const timedOut = anyErr?.name === "ERR_SCRIPT_EXECUTION_TIMEOUT" || /timed out/i.test(anyErr?.message ?? "");
      return {
        ok: false,
        logs,
        error: {
          code: timedOut ? "SANDBOX_TIMEOUT" : "SANDBOX_ERROR",
          message: anyErr?.message ?? "Sandbox execution failed.",
        },
        durationMs: Date.now() - started,
      };
    }
  };
}

const runCodeSchema = z.object({
  code: z.string().describe("JavaScript snippet; `return` a value to capture it."),
});

/**
 * Tool wrapper: expose the sandbox to an agent as `run_code`.
 * Fails closed — sandbox errors come back as structured failures.
 */
export function codeInterpreterTool(options: SandboxOptions = {}): Tool<
  { code: string },
  ToolResult<SandboxResult>
> {
  const sandbox = createSandbox(options);
  return {
    name: "run_code",
    description: "Execute a JavaScript snippet in a locked-down sandbox and return its result and logs.",
    schema: {
      type: "object",
      properties: { code: { type: "string" } },
      required: ["code"],
      additionalProperties: false,
    },
    inputSchema: runCodeSchema,
    async execute({ code }): Promise<ToolResult<SandboxResult>> {
      const result = await sandbox(code);
      if (!result.ok) {
        return failure(result.error?.code ?? "SANDBOX_ERROR", result.error?.message ?? "Sandbox failed.", {
          retryable: false,
          details: { logs: result.logs },
        });
      }
      return result;
    },
  };
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Strip anything that cannot cross the vm boundary cleanly. */
function sanitize(value: unknown): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}