/**
 * XLT-01 — Microfone ponta a ponta em Chromium real (V4 T1.2, SPEC §7 A3/A4).
 *
 * Camadas reais atravessadas (3):
 *   (a) configuração de produção — `isMicrophoneEnabled()` + `buildPermissionsPolicy()`
 *       + `buildCspValue()` de `src/proxy-utils.ts` / `src/lib/capabilities.ts`
 *       (a MESMA fonte que `src/middleware.ts` usa; flag REAL exercitada via
 *       `NEXT_PUBLIC_TED_MICROPHONE=true` no processo do teste — mesmo valor
 *       do deploy da Fase 1 em `apps/pwa/wrangler.jsonc`; leitura em call-time,
 *       sem mock);
 *   (b) HTTP efetivamente servido — servidor `node:http` efêmero que emite as
 *       headers de produção por resposta (semântica do middleware, incluindo
 *       CSP com nonce fresco que autoriza o próprio harness);
 *   (c) stack de mídia do browser + lifecycle da UI — Chromium real com device
 *       fake (`--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream`):
 *       click no botão → requesting → recording (getUserMedia + MediaRecorder
 *       reais) → stop → attachment/resultado gerado; e, no documento servido
 *       com a emissão de capability DESLIGADA (`microphone=()`), o próprio
 *       Chromium nega (`NotAllowedError: Permission denied` genuíno) →
 *       `fail("denied")` → error, sem gravação fantasma. Isso prova a direção
 *       inversa do INV-08 bidirecional (T1.1) com enforcement real do browser.
 *
 * Nota de engenharia (tentativas reais, não suposição): `--deny-permission-prompts`
 * NÃO produz denial de microfone neste Chromium headless — sem fake device
 * rejeita `NotFoundError`, com fake device rejeita `NotSupportedError`; em
 * nenhum caso `NotAllowedError`. A denial `NotAllowedError` autêntica vem da
 * enforcement da Permissions-Policy servida, que é o que o teste usa.
 *
 * Limitação honesta (assumida na tarefa): o fluxo de UI usa um harness servido
 * que espelha o contrato de `use-recording-state.ts` (idle/requesting/recording/
 * processing/error, `fail()` com reason denied/notfound/busy, teardown
 * idempotente) em vez do TedChat montado — montar o TedChat real exigiria
 * webServer/Next standalone, que a categoria XLT proíbe de propósito
 * (`xlt.config.ts`: sem webServer). As transições do hook real estão travadas
 * pelos units (`TedChat.recording`, `TedChat.microphone`,
 * `use-recording-state-mic-error`); este XLT prova o que units não alcançam:
 * header real + getUserMedia real + MediaRecorder real no mesmo browser.
 * A gravação contra o build Cloudflare será validada no smoke do deploy da
 * Fase 1 (R3).
 */

import { test, expect, chromium } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  buildCspValue,
  buildPermissionsPolicy,
  generateNonce,
  SECURITY_HEADERS,
} from "../../src/proxy-utils";
import { isMicrophoneEnabled } from "../../src/lib/capabilities";

// Flag REAL exercitada: mesmo valor do deploy da Fase 1 (wrangler.jsonc).
// `isMicrophoneEnabled()` lê em call-time, então setar aqui vale para as
// emissões do servidor efêmero dentro deste arquivo.
const PREV_MIC_FLAG = process.env.NEXT_PUBLIC_TED_MICROPHONE;
process.env.NEXT_PUBLIC_TED_MICROPHONE = "true";

const RECORDING_ERROR_MESSAGE =
  "Não foi possível acessar o microfone. Verifique as permissões.";

/** Emissão equivalente à de src/middleware.ts em produção. */
function emitProductionHeaders(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  body: string,
  micEnabled: boolean,
): void {
  const nonce = generateNonce();
  res.setHeader("Content-Security-Policy", buildCspValue(nonce, false));
  res.setHeader("x-nonce", nonce);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(
      key,
      key === "Permissions-Policy" ? buildPermissionsPolicy(micEnabled) : value,
    );
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(body.replaceAll("__NONCE__", nonce));
}

/**
 * Harness de lifecycle que espelha o contrato de use-recording-state.ts:
 * mesmos estados, mesma ordem (getUserMedia → MediaRecorder → start →
 * recording), mesmo vocabulário de reason (denied/notfound/busy) e mesmos
 * aria-labels do botão do TedChat. O que ele NÃO duplica: lógica de
 * React — o hook real é coberto pelos units; aqui o valor é atravessar
 * header + browser API + lifecycle no mesmo documento.
 */
function micHarnessPage(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>XLT-01 mic harness</title></head>
<body>
  <button type="button" id="mic-btn" aria-label="Gravar áudio">Gravar áudio</button>
  <span id="mic-state" data-testid="mic-state">idle</span>
  <span id="mic-error" data-testid="mic-error" hidden></span>
  <script nonce="__NONCE__">
    window.__mic = (() => {
      let state = "idle";
      let stream = null, recorder = null, chunks = [];
      let enteredRecording = false, lastReason = null, blobInfo = null;
      const attachments = [];
      const btn = document.getElementById("mic-btn");
      const stateEl = document.getElementById("mic-state");
      const errorEl = document.getElementById("mic-error");
      function render() {
        stateEl.textContent = state;
        btn.setAttribute("aria-label",
          state === "recording" ? "Parar gravação" :
          state === "requesting" ? "Solicitando permissão de microfone" : "Gravar áudio");
        btn.textContent =
          state === "recording" ? "Parar gravação" :
          state === "requesting" ? "Solicitando permissão…" : "Gravar áudio";
      }
      function mapReason(e) {
        const n = (e && e.name) || "";
        if (n === "NotAllowedError" || n === "SecurityError") return "denied";
        if (n === "NotFoundError" || n === "OverconstrainedError" || n === "TypeError") return "notfound";
        return "busy";
      }
      function stopTracks(s) {
        if (!s) return;
        try { s.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} }); } catch (_) {}
      }
      function fail(reason) {
        stopTracks(stream);
        stream = null; recorder = null; chunks = [];
        lastReason = reason;
        errorEl.hidden = false;
        errorEl.textContent = ${JSON.stringify(RECORDING_ERROR_MESSAGE)};
        state = "error"; render();
      }
      async function start() {
        if (state === "requesting" || state === "recording" || state === "processing") return;
        if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
          fail("notfound"); return;
        }
        state = "requesting"; render();
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) { fail(mapReason(e)); return; }
        try {
          recorder = new MediaRecorder(stream);
        } catch (_) { fail("busy"); return; }
        chunks = [];
        recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunks.push(ev.data); };
        recorder.onstop = () => {
          try {
            const mime = (recorder && recorder.mimeType) || "audio/webm";
            const blob = new Blob(chunks, { type: mime });
            blobInfo = { type: blob.type, size: blob.size, fired: true };
            attachments.push({ type: "audio", size: blob.size, mime: blob.type });
          } catch (_) { blobInfo = { fired: false }; }
          stopTracks(stream);
          stream = null; recorder = null; chunks = [];
          state = "idle"; render();
        };
        try {
          recorder.start();
        } catch (_) { fail("busy"); return; }
        enteredRecording = true;
        state = "recording"; render();
      }
      function stop() {
        if (state === "requesting") { state = "idle"; render(); return; }
        if (!recorder) { if (state !== "idle") { state = "idle"; render(); } return; }
        state = "processing"; render();
        try { recorder.stop(); } catch (_) { state = "idle"; render(); }
      }
      btn.addEventListener("click", () => {
        if (state === "recording" || state === "processing") stop();
        else if (state === "idle") start();
      });
      render();
      return {
        snapshot: () => ({
          state,
          enteredRecording,
          lastReason,
          attachments: attachments.length,
          blobFired: !!(blobInfo && blobInfo.fired),
          blobType: blobInfo ? blobInfo.type : null,
        }),
        audioLive: () => !!stream && stream.getAudioTracks().some((t) => t.readyState === "live"),
      };
    })();
  </script>
</body>
</html>`;
}

let server: http.Server;
let micURL: string;
let micDeniedURL: string;

test.beforeAll(async () => {
  const page = micHarnessPage();
  server = http.createServer((req, res) => {
    // `/mic`: emissão com a capability vigente (flag REAL on → self).
    // `/mic-denied`: a emissão de capability DESLIGADA (T1.1, INV-08 inverso) —
    // o browser impõe `microphone=()` com NotAllowedError genuíno.
    if (req.url === "/mic") emitProductionHeaders(req, res, page, isMicrophoneEnabled());
    else if (req.url === "/mic-denied") emitProductionHeaders(req, res, page, false);
    else {
      res.statusCode = 404;
      res.end("not found");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  micURL = `http://127.0.0.1:${port}/mic`;
  micDeniedURL = `http://127.0.0.1:${port}/mic-denied`;
});

test.afterAll(async () => {
  if (PREV_MIC_FLAG === undefined) delete process.env.NEXT_PUBLIC_TED_MICROPHONE;
  else process.env.NEXT_PUBLIC_TED_MICROPHONE = PREV_MIC_FLAG;
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

test("[XLT-01] document served with production mic policy (capability on)", async ({
  page,
}) => {
  const response = await page.goto(micURL);
  expect(response).not.toBeNull();
  const headers = response!.headers();
  // Crossing (a)→(b): o documento carrega a policy da capability vigente.
  expect(isMicrophoneEnabled()).toBe(true);
  expect(headers["permissions-policy"]).toBe(buildPermissionsPolicy(true));
  expect(headers["permissions-policy"]).toContain("microphone=(self)");
  // Emissão de produção: CSP sem escape de dev, autorizando o próprio harness.
  expect(headers["content-security-policy"]).not.toContain("unsafe-eval");
  await expect(page.getByTestId("mic-state")).toHaveText("idle");
});

test.describe("[XLT-01] granted flow (fake media device)", () => {
  // NOTE: `test.use({ launchOptions })` é proibido dentro de describe
  // (forçaria worker novo), então cada teste sobe seu próprio browser com
  // os launch args de mídia fake e o fecha em finally — sem órfãos.
  const FAKE_MEDIA_ARGS = [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ];

  async function withFakeMediaPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    const browser: Browser = await chromium.launch({
      headless: true,
      args: FAKE_MEDIA_ARGS,
    });
    try {
      const page = await browser.newContext({ serviceWorkers: "block" }).then((c) => c.newPage());
      return await fn(page);
    } finally {
      await browser.close();
    }
  }

  test("getUserMedia resolves under the served self policy", async () => {
    await withFakeMediaPage(async (page) => {
      await page.goto(micURL);
      // A policy microphone=(self) não bloqueia o próprio documento.
      const result = await page.evaluate(async () => {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        const live = s.getAudioTracks().some((t) => t.readyState === "live");
        s.getTracks().forEach((t) => t.stop());
        return { live, tracks: s.getAudioTracks().length };
      });
      expect(result.live).toBe(true);
      expect(result.tracks).toBeGreaterThanOrEqual(1);
    });
  });

  test("idle → click mic → requesting → recording → stop → attachment", async () => {
    await withFakeMediaPage(async (page) => {
      await page.goto(micURL);
      const state = page.getByTestId("mic-state");
      await expect(state).toHaveText("idle");

      // Click REAL no botão (mesmo aria-label do TedChat com cap ligada).
      await page.getByRole("button", { name: "Gravar áudio" }).click();
      await expect(state).toHaveText("recording", { timeout: 10_000 });

      // Stream real do fake device, trilha viva.
      expect(await page.evaluate(() => window.__mic.audioLive())).toBe(true);

      await page.getByRole("button", { name: "Parar gravação" }).click();
      await expect(state).toHaveText("idle", { timeout: 10_000 });

      // Attachment/resultado gerado: onstop → Blob → 1 anexo de áudio.
      const snap = await page.evaluate(() => window.__mic.snapshot());
      expect(snap.enteredRecording).toBe(true);
      expect(snap.lastReason).toBeNull();
      expect(snap.blobFired).toBe(true);
      expect(String(snap.blobType)).toMatch(/^audio\//);
      expect(snap.attachments).toBe(1);
      // Mic liberado após o stop (sem trilha viva residual).
      expect(await page.evaluate(() => window.__mic.audioLive())).toBe(false);
    });
  });
});

test.describe("[XLT-01] denied flow (served microphone=() policy)", () => {
  async function withDeniedPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    // Mesmo browser de mídia fake do fluxo granted: a denial vem da
    // enforcement da policy servida, não de launch arg.
    const browser: Browser = await chromium.launch({
      headless: true,
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
      ],
    });
    try {
      const page = await browser.newContext({ serviceWorkers: "block" }).then((c) => c.newPage());
      return await fn(page);
    } finally {
      await browser.close();
    }
  }

  test("denied → error, never recording, no ghost state", async () => {
    await withDeniedPage(async (page) => {
      const response = await page.goto(micDeniedURL);
      // O documento carrega a emissão de capability desligada…
      expect(response!.headers()["permissions-policy"]).toBe(
        buildPermissionsPolicy(false),
      );
      const state = page.getByTestId("mic-state");
      await expect(state).toHaveText("idle");

      await page.getByRole("button", { name: "Gravar áudio" }).click();
      await expect(state).toHaveText("error", { timeout: 10_000 });

      const snap = await page.evaluate(() => window.__mic.snapshot());
      // `fail()` com reason denied (vocabulário SPEC §24.7, igual ao hook real).
      expect(snap.lastReason).toBe("denied");
      // NENHUMA gravação fantasma: recording nunca foi alcançado.
      expect(snap.enteredRecording).toBe(false);
      expect(snap.attachments).toBe(0);
      expect(snap.blobFired).toBe(false);
      await expect(page.getByTestId("mic-error")).toHaveText(
        RECORDING_ERROR_MESSAGE,
      );

      // Sem resíduo: o estado não migra sozinho para recording/idle.
      await page.waitForTimeout(1000);
      const later = await page.evaluate(() => window.__mic.snapshot());
      expect(later.state).toBe("error");
      expect(later.enteredRecording).toBe(false);
    });
  });
});
