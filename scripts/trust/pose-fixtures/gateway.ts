/**
 * The vision double. One HTTP server, two jobs.
 *
 * 1. ANSWER the two engine calls exactly as their real gateways do, in the shape the product
 *    parses: `POST {ANTIGRAVITY_BASE_URL}/v1/chat/completions` for stage 1 and
 *    `POST {VOID_AI_BASE_URL}/chat/completions` for stage 2, both OpenAI-shaped
 *    `{choices:[{message:{content}}]}`. The two base URLs point at THIS server in the e2e, so
 *    what is under test is the product's own request-building and response-parsing, not a mock
 *    bolted onto a function.
 *
 * 2. TESTIFY. Every prompt it receives is logged verbatim and the control plane lets the suite
 *    read it back. This is the only way to prove the claims that matter about this feature —
 *      - the engines were asked about the pose the SERVER issued, not the string in the request;
 *      - no photograph URL or base64 ever entered a prompt;
 *      - a configured second engine that refused us is reported rather than hidden.
 *    Those are unobservable from the response alone, which is why the previous, in-process
 *    version of this test could not assert them and shipped a bug anyway.
 *
 * It also serves the member's profile photo, so `collectProfilePhotos()` really fetches bytes.
 *
 * Run by scripts/trust/pose-run.mjs IN THE PARENT process, one server for every mode, so all
 * five children testify against the same witness. The suite resets it at the start of each mode.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import { createHash } from "node:crypto";

/** Stage 1 is the inspector. The suite needs to see the three objective refusals (unreadable,
 *  two faces, too dark) as well as the pass, and each of those is a decision the ROUTE makes from
 *  the engine's JSON — so the double must be able to answer with each shape. */
export type Stage1Mode = "ok" | "unparseable" | "two-faces" | "dark" | "no-match" | "empty";

export type Stage2Mode =
  | "approve"
  | "no-live-person"
  | "identity-mismatch"
  | "gesture-missing"
  | "low-confidence"
  | "unparseable"
  | "empty";

/** A 1×1 PNG. Real enough for `content-type` and length checks; the engines are scripted, so no
 *  pixels are interpreted and none are needed. */
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64"
);

export type CallLog = {
  n: number;
  /** "stage1" (Antigravity) or "stage2" (the second engine). */
  engine: string;
  /** The `asked pose: '...'` / `roughly perform: "..."` fragment extracted from the prompt. */
  asked: string | null;
  /** Everything the prompt said, for the "no photo in the prompt" assertions. */
  text: string;
  images: number;
  /** The first image_url value, truncated: enough to detect a data URL smuggled into text. */
  firstImage: string;
  model: string;
  chars: number;
};

const MAX_TEXT = 4000;

export function startGateway(): Promise<{ url: string; close: () => Promise<void> }> {
  const state = {
    log: [] as CallLog[],
    stage2: "approve" as Stage2Mode,
    stage1: "ok" as Stage1Mode,
    /* Stage-1 transport status. 502 is what the real free gateway answers when the model id
       does not exist behind it - the failure that used to reach a member as "your photo is
       unreadable". Kept as a number so a 401/429 can be scripted too. */
    stage1Status: 200 as number,
    /** The pose label this server has SEEN, per engine. If the product ever sends the client's
     *  string instead of the server's, the suite finds it here rather than guessing. */
    seen: { stage1: [] as (string | null)[], stage2: [] as (string | null)[] },
  };

  const stage1Reply = (asked: string | null): string => {
    switch (state.stage1) {
      /* Deliberately prose, not JSON: parseVerdict must fail and the route must say
         "unreadable photo" rather than guess a verdict out of a sentence. */
      case "unparseable":
        return "the person appears to be doing something with a hand";
      case "two-faces":
        return JSON.stringify({ observedPose: "two people", faceCount: 2, lightingOk: true, matchesAsked: true });
      case "dark":
        return JSON.stringify({ observedPose: "unlit face", faceCount: 1, lightingOk: false, matchesAsked: true });
      /* The pose was performed as something else. Objective read, honest negative — this is the
         only stage-1 shape that lets the ONE-engine chain be tested for holding rather than
         approving, which is what the refused-engine assertions below need. */
      case "no-match":
        return JSON.stringify({ observedPose: "both hands at the sides", faceCount: 1, lightingOk: true, matchesAsked: false });
      case "empty":
        return "";
      default:
        return JSON.stringify({
          observedPose: asked ? `a hand performing: ${asked}` : "a hand near the face",
          faceCount: 1,
          lightingOk: true,
          matchesAsked: true,
        });
    }
  };

  const stage2Reply = (asked: string | null): string => {
    switch (state.stage2) {
      case "no-live-person":
        return JSON.stringify({ livePerson: false, gestureOk: true, samePerson: "yes", confidence: "high", reason: "no live person" });
      case "identity-mismatch":
        return JSON.stringify({ livePerson: true, gestureOk: true, samePerson: "no", confidence: "high", reason: "different face" });
      case "gesture-missing":
        return JSON.stringify({ livePerson: true, gestureOk: false, samePerson: "yes", confidence: "high", reason: "gesture absent" });
      case "low-confidence":
        /* The shape that used to be able to slip through: everything positive, so
           `approvable` was true. Only `confidence` keeps it out of self-service. */
        return JSON.stringify({ livePerson: true, gestureOk: true, samePerson: "unclear", confidence: "low", reason: "uncertain" });
      case "unparseable":
        return "the photograph looks fine to me, thank you";
      case "empty":
        return "";
      default:
        return JSON.stringify({
          livePerson: true,
          gestureOk: true,
          samePerson: "yes",
          confidence: "high",
          /* `asked:` is a deliberate echo, not part of the product contract: the suite reads it
             out of the log to prove which pose the SECOND engine was shown. Without it the
             assertion "stage 2 was asked about the server's pose" would have nothing to check. */
          reason: `roughly perform: ${asked ?? "?"}`,
          asked: asked ?? null,
        });
    }
  };

  const readJson = (req: IncomingMessage): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const send = (code: number, body: unknown, type = "application/json") => {
      const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
      res.writeHead(code, {
        "content-type": type,
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      });
      res.end(payload as string | Buffer);
    };

    if (req.method === "GET" && url.pathname === "/__e2e_health") return send(200, { ok: true });
    if (req.method === "GET" && url.pathname === "/__e2e_log")
      return send(200, { calls: state.log, seen: state.seen });
    if (req.method === "GET" && url.pathname === "/__e2e_reset") {
      state.log.length = 0;
      state.seen.stage1.length = 0;
      state.seen.stage2.length = 0;
      state.stage2 = "approve";
      state.stage1 = "ok";
      return send(200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/__e2e_stage1") {
      void readJson(req).then((b) => {
        try {
          const j = JSON.parse(b.toString("utf8")) as { mode?: Stage1Mode };
          if (j.mode) state.stage1 = j.mode;
        } catch {
          /* keep the previous script */
        }
        send(200, { ok: true, mode: state.stage1 });
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/__e2e_stage2") {
      void readJson(req).then((b) => {
        try {
          const j = JSON.parse(b.toString("utf8")) as { mode?: Stage2Mode };
          if (j.mode) state.stage2 = j.mode;
        } catch {
          /* keep the previous script */
        }
        send(200, { ok: true, mode: state.stage2 });
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/__e2e_stage1_status") {
      void readJson(req).then((b) => {
        try {
          const j = JSON.parse(b.toString("utf8")) as { code?: number };
          if (typeof j.code === "number") state.stage1Status = j.code;
        } catch {
          /* keep the previous script */
        }
        send(200, { ok: true, stage1Status: state.stage1Status });
      });
      return;
    }
    if (req.method === "GET" && (url.pathname === "/__e2e_photo" || url.pathname.startsWith("/storage/"))) {
      return send(200, PNG_1x1, "image/png");
    }

    if (req.method === "POST" && (url.pathname === "/v1/chat/completions" || url.pathname === "/chat/completions")) {
      void readJson(req)
        .then((b) => {
          const body = JSON.parse(b.toString("utf8")) as {
            model?: string;
            messages?: Array<{ role?: string; content?: unknown }>;
          };
          const first = body.messages?.[0]?.content;
          const parts: Array<Record<string, unknown>> = Array.isArray(first)
            ? (first as Array<Record<string, unknown>>)
            : [{ type: "text", text: String(first ?? "") }];
          const text = parts
            .filter((p) => typeof p.text === "string")
            .map((p) => p.text as string)
            .join("\n");
          const images = parts.filter((p) => p.type === "image_url").length;
          const firstImage = String(
            (parts.find((p) => p.type === "image_url")?.image_url as { url?: string } | undefined)?.url ?? ""
          ).slice(0, 64);

          const isStage2 = /SECOND, independent checker/.test(text);
          const engine = isStage2 ? "stage2" : "stage1";
          /* Two prompt shapes carry the pose claim: stage 1 embeds it single-quoted after
             "asked pose:", stage 2 double-quoted after "roughly perform:". Extracting both
             patterns from BOTH prompts is deliberate — if a future refactor lets one stage ask
             about the client's string while the other asks about ours, this is what sees it. */
          const single = text.match(/asked pose:\s*'([^']{0,140})'/)?.[1] ?? null;
          const dbl = text.match(/roughly perform:\s*"([^"]{0,140})"/)?.[1] ?? null;
          const asked = isStage2 ? (dbl ?? single) : (single ?? dbl);
          state.seen[engine as "stage1" | "stage2"].push(asked);
          state.log.push({
            n: state.log.length + 1,
            engine,
            asked,
            text: text.slice(0, MAX_TEXT),
            images,
            firstImage,
            model: body.model ?? "",
            chars: text.length,
          });

          if (!isStage2 && state.stage1Status !== 200) {
            return send(state.stage1Status, {
              error: { message: `backend 404: Requested entity was not found (scripted ${state.stage1Status})` },
            });
          }
          const content = isStage2 ? stage2Reply(asked) : stage1Reply(asked);
          if (!content) return send(200, { error: { message: "empty completion" } });
          return send(200, {
            id: `e2e-${createHash("sha1").update(text).digest("hex").slice(0, 8)}`,
            object: "chat.completion",
            model: body.model ?? "e2e",
            choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
            usage: { prompt_tokens: Math.ceil(text.length / 4), completion_tokens: 40, total_tokens: 0 },
          });
        })
        .catch((e: unknown) => send(500, { error: { message: String(e).slice(0, 200) } }));
      return;
    }

    send(404, { error: { message: `unhandled ${req.method} ${url.pathname}` } });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}

/* Also runnable on its own (`node .gateway.build.mjs [port]`), which is how a human re-plays a
   single mode by hand against a fixed port. */
if (process.env.__POSE_GATEWAY_STANDALONE === "1") {
  void startGateway().then(({ url }) => {
    console.log(`GATEWAY_LISTENING ${url}`);
  });
}
