import vm from "vm";

export type CaseResult = {
  input: string; expected: string; actual: string; passed: boolean;
  log: string[]; hidden: boolean;
};

export type RunResult = {
  stdout: string; stderr: string; runtimeMs: number;
  passedCount: number; totalCount: number; results: CaseResult[];
};

type TestCaseInput = { input: string; expected: string; hidden: boolean };

const JUDGE0_LANGUAGE_IDS: Record<string, number> = {
  javascript: 63,
  python: 71,
  csharp: 51,
  c: 50,
  cpp: 54,
};

export function isLanguageRunnable(language: string): boolean {
  return language === "javascript" || (Object.prototype.hasOwnProperty.call(JUDGE0_LANGUAGE_IDS, language) && !!process.env.JUDGE0_URL);
}

const NOT_RUN = (tests: TestCaseInput[]): CaseResult[] =>
  tests.map((t) => ({ input: t.input, expected: t.expected, actual: "not run", passed: false, log: [], hidden: t.hidden }));

export async function runCode(code: string, language: string, tests: TestCaseInput[]): Promise<RunResult> {
  if (language === "javascript" && !process.env.JUDGE0_URL) return runLocal(code, tests);
  if (!isLanguageRunnable(language)) throw new Error(`The ${language} runner is unavailable. Configure a private Judge0 instance with JUDGE0_URL to run this language.`);
  return runViaJudge0(code, language, tests);
}

export async function runProgram(code: string, language: string, input: string): Promise<RunResult> {
  if (!isLanguageRunnable(language)) throw new Error(`The ${language} runner is unavailable. Configure a private Judge0 instance with JUDGE0_URL to run this language.`);
  if (language === "javascript" && !process.env.JUDGE0_URL) return runLocalProgram(code, input);
  return runProgramViaJudge0(code, language, input);
}

function runLocalProgram(code: string, input: string): RunResult {
  const output: string[] = [];
  const print = (...values: unknown[]) => output.push(values.map((value) => {
    if (typeof value === "string") return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  }).join(" "));
  const t0 = performance.now();
  try {
    new vm.Script(code, { filename: "practice.js" }).runInNewContext({
      console: { log: print, info: print, warn: print, error: print },
      input,
    }, { timeout: 4000 });
    return {
      stdout: output.join("\n"),
      stderr: "",
      runtimeMs: Math.max(1, Math.round(performance.now() - t0)),
      passedCount: 0, totalCount: 0, results: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      stdout: output.join("\n"),
      stderr: /timed out/i.test(message) ? "Execution timed out after 4 seconds." : message,
      runtimeMs: Math.max(1, Math.round(performance.now() - t0)),
      passedCount: 0, totalCount: 0, results: [],
    };
  }
}

// vm sandbox: user code + harness in one strict-mode script, 4s wall clock, per-case console capture.
function runLocal(code: string, tests: TestCaseInput[]): RunResult {
  const src = `(function(){
  "use strict";
  var CASES = ${JSON.stringify(tests.map((t) => ({ input: t.input, expected: t.expected, hidden: t.hidden })))};
  var results = [];
  function fmt(v){ try { return v === undefined ? "undefined" : (typeof v === "string" ? v : JSON.stringify(v)); } catch(e){ return String(v); } }
  function mkConsole(sink){ function push(){ var a=[]; for(var i=0;i<arguments.length;i++)a.push(arguments[i]); sink.push(a.map(fmt).join(" ")); } return { log: push, error: push, warn: push, info: push }; }
  var console = mkConsole([]);
  ${code}
  if (typeof solve !== "function") return { error: "Your code must define a function named solve(input).", results: [] };
  for (var k = 0; k < CASES.length; k++) {
    var c = CASES[k];
    var log = [];
    console = mkConsole(log);
    var t0 = Date.now();
    try {
      var actual = solve(JSON.parse(c.input));
      var actualStr = (function(){ try { return JSON.stringify(actual === undefined ? null : actual); } catch(e){ return String(actual); } })();
      results.push({ input: c.input, expected: c.expected, actual: actualStr, passed: actualStr === c.expected, log: log.slice(0, 50), hidden: c.hidden });
    } catch (e) {
      results.push({ input: c.input, expected: c.expected, actual: "Error: " + (e && e.message ? e.message : String(e)), passed: false, log: log.slice(0, 50), hidden: c.hidden });
    }
    void t0;
  }
  return { error: null, results: results };
})()`;

  const t0 = performance.now();
  try {
    const out = new vm.Script(src, { filename: "submission.js" }).runInNewContext({}, { timeout: 4000 }) as {
      error: string | null; results: CaseResult[];
    };
    const results = out?.results ?? [];
    return {
      stdout: "",
      stderr: out?.error ?? "",
      runtimeMs: Math.max(1, Math.round(performance.now() - t0)),
      passedCount: results.filter((r) => r.passed).length,
      totalCount: results.length,
      results,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const timedOut = /timed out/i.test(msg);
    return {
      stdout: "",
      stderr: timedOut
        ? "Execution timed out after 4s. A loop probably isn't terminating — an O(n²) scan over that input size won't finish in time."
        : `Syntax error: ${msg}`,
      runtimeMs: Math.round(performance.now() - t0),
      passedCount: 0, totalCount: tests.length, results: NOT_RUN(tests),
    };
  }
}

// Judge0 path when JUDGE0_URL is set. Server-side only; each case is a fresh batch submission.
async function runViaJudge0(code: string, language: string, tests: TestCaseInput[]): Promise<RunResult> {
  const url = process.env.JUDGE0_URL!.replace(/\/$/, "");
  const key = process.env.JUDGE0_API_KEY;
  try {
    const t0 = performance.now();
    const res = await fetch(`${url}/submissions/batch?base64_encoded=false&wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key ? { Authorization: ["Bearer", key].join(" ") } : {}) },
      body: JSON.stringify({
        submissions: tests.map((t) => ({
          language_id: JUDGE0_LANGUAGE_IDS[language],
          source_code: judge0Source(code, language, t.input),
          ...(["c", "cpp", "csharp"].includes(language) ? { stdin: t.input } : {}),
        })),
      }),
    });
    if (!res.ok) throw new Error(`execution service responded ${res.status}`);
    const subs = (await res.json()) as { stdout?: string; stderr?: string; compile_output?: string; status?: { description?: string } }[];
    const results: CaseResult[] = tests.map((t, i) => {
      const s = subs[i] ?? {};
      const outputLines = (s.stdout ?? "").trimEnd().split(/\r?\n/);
      const actual = outputLines.pop()?.trim() || `Error: ${(s.compile_output ?? s.stderr ?? s.status?.description ?? "no output").trim()}`;
      const logs = [...outputLines, ...(s.stderr ? [s.stderr.trim()] : [])].filter(Boolean).slice(0, 50);
      return { input: t.input, expected: t.expected, actual, passed: actual === t.expected, log: logs, hidden: t.hidden };
    });
    return { stdout: "", stderr: "", runtimeMs: Math.round(performance.now() - t0), passedCount: results.filter((r) => r.passed).length, totalCount: results.length, results };
  } catch (e) {
    return {
      stdout: "", stderr: `Execution service error: ${e instanceof Error ? e.message : String(e)}`,
      runtimeMs: 0, passedCount: 0, totalCount: tests.length, results: NOT_RUN(tests),
    };
  }
}

async function runProgramViaJudge0(code: string, language: string, input: string): Promise<RunResult> {
  const url = process.env.JUDGE0_URL!.replace(/\/$/, "");
  const key = process.env.JUDGE0_API_KEY;
  const t0 = performance.now();
  try {
    const response = await fetch(`${url}/submissions?base64_encoded=false&wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key ? { Authorization: ["Bearer", key].join(" ") } : {}) },
      body: JSON.stringify({
        language_id: JUDGE0_LANGUAGE_IDS[language],
        source_code: judge0ProgramSource(code, language),
        stdin: input,
      }),
    });
    if (!response.ok) throw new Error(`execution service responded ${response.status}`);
    const submission = await response.json() as {
      stdout?: string | null; stderr?: string | null; compile_output?: string | null;
      status?: { description?: string; id?: number };
    };
    const successful = submission.status?.id === 3;
    return {
      stdout: submission.stdout ?? "",
      stderr: successful ? (submission.stderr ?? "") : (submission.compile_output || submission.stderr || submission.status?.description || "The program did not finish successfully."),
      runtimeMs: Math.max(1, Math.round(performance.now() - t0)),
      passedCount: 0, totalCount: 0, results: [],
    };
  } catch (error) {
    return {
      stdout: "",
      stderr: `Execution service error: ${error instanceof Error ? error.message : String(error)}`,
      runtimeMs: Math.max(0, Math.round(performance.now() - t0)),
      passedCount: 0, totalCount: 0, results: [],
    };
  }
}

function judge0Source(code: string, language: string, input: string): string {
  if (language === "python") {
    return `${code}\nimport json as __edusphere_json\n__edusphere_input = __edusphere_json.loads(${JSON.stringify(input)})\n__edusphere_output = solve(__edusphere_input)\nprint(__edusphere_json.dumps(__edusphere_output, separators=(",", ":")))`;
  }
  if (language === "c" || language === "cpp" || language === "csharp") return code;
  return `${code}\nconst __edusphere_output = solve(JSON.parse(${JSON.stringify(input)}));\nconsole.log(JSON.stringify(__edusphere_output === undefined ? null : __edusphere_output));`;
}

function judge0ProgramSource(code: string, language: string): string {
  if (language === "python") return `${code}\n`;
  return code;
}
