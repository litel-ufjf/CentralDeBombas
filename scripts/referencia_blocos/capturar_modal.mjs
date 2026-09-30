// Abre o painel no Chrome headless, clica em "Programar experimento" e salva o print do modal.
// Uso: node capturar_modal.mjs [url] [saida.png] [largura] [altura] [cenario.js]
// O cenário opcional roda na página antes do print e deve avaliar para uma Promise<string>.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const url = process.argv[2] ?? "http://127.0.0.1:5173/#/bomba/2";
const out = resolve(process.argv[3] ?? "atual.png");
const width = Number(process.argv[4] ?? 1920);
const height = Number(process.argv[5] ?? 1031);
const scenario = process.argv[6] ? readFileSync(resolve(process.argv[6]), "utf8") : null;
const port = 9333;
const chrome =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const profile = mkdtempSync(join(tmpdir(), "bomba-shot-"));
const browser = spawn(
  chrome,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function pageSocket() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((target) => target.type === "page");
      if (page) {
        return page.webSocketDebuggerUrl;
      }
    } catch {
      // Chrome ainda subindo.
    }
    await sleep(200);
  }
  throw new Error("Chrome não abriu a porta de depuração");
}

try {
  const ws = new WebSocket(await pageSocket());
  await new Promise((done) => ws.addEventListener("open", done, { once: true }));
  let seq = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((done) => {
      seq += 1;
      pending.set(seq, done);
      ws.send(JSON.stringify({ id: seq, method, params }));
    });

  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.enable");
  await send("Page.navigate", { url });
  await sleep(2500);
  const click = await send("Runtime.evaluate", {
    expression: `(() => {
      const button = [...document.querySelectorAll("button")].find((b) =>
        /programar experimento/i.test(b.getAttribute("aria-label") ?? b.textContent ?? ""));
      if (!button) return "sem botão";
      button.click();
      return "ok";
    })()`,
    returnByValue: true,
  });
  console.log("clique:", click.result?.result?.value);
  await sleep(1200);
  if (scenario) {
    const run = await send("Runtime.evaluate", {
      expression: scenario,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log(
      "cenário:",
      run.result?.result?.value ??
        run.result?.exceptionDetails?.exception?.description ??
        JSON.stringify(run.result),
    );
    await sleep(400);
  }
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  console.log("salvo:", out);
  ws.close();
} finally {
  browser.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}
