// Testa a programação na UI sem placa: injeta um window.bomba que responde como o interface_prog.
// Uso: node testar_ui_simulada.mjs [url_base] [pasta_prints]
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:5173/";
const outDir = resolve(process.argv[3] ?? join(tmpdir(), "bomba-prog-prints"));
const width = 1280;
const height = 860;
const port = 9334;
const chrome =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const fakeBoard = `(() => {
  const listeners = new Set();
  const programs = {};
  const motors = {};
  [1, 2, 3, 4, 5, 6].forEach((i) => { motors[i] = { en: 0, dir: "F", pwm: 0 }; });
  const stateLine = () =>
    "S" + [1, 2, 3, 4, 5, 6].map((i) => programs[i]?.state === "U"
      ? "," + i + ",1,F,55.00"
      : "," + i + "," + motors[i].en + "," + motors[i].dir + "," + motors[i].pwm.toFixed(2)).join("");
  const sent = [];
  window.__sent = sent;
  let clockOffset = null;
  const emit = (line) => setTimeout(() => listeners.forEach((fn) => fn(line)), 15);
  const state = (p) => p.state;
  const runSeconds = (p) =>
    p.state === "U" ? p.acc + (Date.now() - p.since) / 1000 : p.acc;
  const report = (id) => {
    const p = programs[id];
    emit(["R", id, p.state, 0, p.n, runSeconds(p).toFixed(1), p.startAt, p.state === "U" ? "20.00" : "0.00"].join(","));
  };
  const reply = (line) => {
    const parts = line.split(",");
    const id = Number(parts[1]);
    const p = programs[id];
    switch (parts[0]) {
      case "H": emit("H,BOMBA,6,12,PROG1,PROG2,PROG3,PROG4"); break;
      case "T": clockOffset = Number(parts[1]) - Date.now(); emit("T," + parts[1]); break;
      case "G":
        emit(stateLine());
        Object.keys(programs).forEach((key) => report(Number(key)));
        break;
      case "P": motors[id].pwm = Number(parts[2]); emit(stateLine()); break;
      case "D": motors[id].dir = parts[2]; emit(stateLine()); break;
      case "E": motors[id].en = Number(parts[2]); emit(stateLine()); break;
      case "PB":
        if (p && ["W", "U", "P"].includes(state(p))) { emit("ERR,ocupada"); break; }
        programs[id] = { state: "L", n: Number(parts[2]), got: 0, acc: 0, since: 0, startAt: 0 };
        report(id);
        break;
      case "PI":
        if (!p || p.state !== "L") { emit("ERR,sem_programa"); break; }
        if (parts.length !== 9) { emit("ERR,instr"); break; }
        p.got += 1;
        if (p.got === p.n) { p.state = "K"; report(id); }
        break;
      case "PS": {
        if (!p || !["K", "D", "S"].includes(p.state)) { emit("ERR,incompleto"); break; }
        const at = Number(parts[2]);
        if (at > 0 && clockOffset === null) { emit("ERR,relogio"); break; }
        p.startAt = at; p.acc = 0;
        if (at > Date.now()) { p.state = "W"; } else { p.state = "U"; p.since = Date.now(); }
        report(id);
        break;
      }
      case "PP":
        if (parts[2] === "1" && p?.state === "U") { p.acc = runSeconds(p); p.state = "P"; report(id); }
        else if (parts[2] === "0" && p?.state === "P") { p.since = Date.now(); p.state = "U"; report(id); }
        else emit("ERR,estado");
        break;
      case "PX":
        if (p && ["W", "U", "P"].includes(p.state)) { p.acc = runSeconds(p); p.state = "S"; }
        if (p) report(id);
        break;
    }
  };
  window.bomba = {
    listPorts: async () => [{ path: "SIM1", label: "SIM1 · placa simulada" }],
    connect: async () => {},
    disconnect: async () => {},
    write: async (line) => { sent.push(line); reply(line); },
    onData: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    onClosed: () => () => {},
  };
})();`;

const profile = mkdtempSync(join(tmpdir(), "bomba-prog-"));
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

const failures = [];
function check(label, ok, extra = "") {
  console.log(`${ok ? "ok  " : "FALHA"} ${label}${extra ? ` · ${extra}` : ""}`);
  if (!ok) {
    failures.push(label);
  }
}

try {
  mkdirSync(outDir, { recursive: true });
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
  const run = async (expression) => {
    const res = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.result?.exceptionDetails) {
      throw new Error(JSON.stringify(res.result.exceptionDetails));
    }
    return res.result?.result?.value;
  };
  const shot = async (name) => {
    const res = await send("Page.captureScreenshot", { format: "png" });
    const file = join(outDir, name);
    writeFileSync(file, Buffer.from(res.result.data, "base64"));
    console.log("print:", file);
  };
  const click = (text, scope = "document") =>
    run(`(() => {
      const root = ${scope};
      if (!root) return false;
      const button = [...root.querySelectorAll("button")].find((b) => b.textContent.trim() === ${JSON.stringify(text)});
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`);
  const dialog = `document.querySelector('[role="alertdialog"]')`;
  const footer = `document.querySelector('[role="dialog"] footer')`;
  const sentSince = async (from) => run(`window.__sent.slice(${from})`);
  const sentCount = async () => run("window.__sent.length");

  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: fakeBoard });
  await send("Page.navigate", { url: `${base}#/bomba/2` });
  await sleep(2500);
  await run("localStorage.clear()");

  check("conectar", await click("Conectar"));
  await sleep(900);
  const hello = await sentSince(0);
  check("sincroniza relógio ao conectar", hello.some((line) => /^T,\d{13}$/.test(line)), hello.join(" | "));

  check("abre o modal", await click("Programar experimento"));
  await sleep(800);
  let mark = await sentCount();
  check("executar agora", await click("Executar agora", footer));
  await sleep(900);
  const upload = await sentSince(mark);
  check(
    "envia PB, PI e PS",
    upload.some((l) => l.startsWith("PB,2,")) &&
      upload.some((l) => l.startsWith("PI,2,0,")) &&
      upload.includes("PS,2,0"),
    upload.join(" | "),
  );
  check("mostra Executando", (await run(`${footer}.textContent`)).includes("Executando"));
  await sleep(1600);
  await shot("1_executando.png");

  check("pausar pede confirmação", (await click("Pausar", footer)) && Boolean(await run(`Boolean(${dialog})`)));
  await sleep(200);
  await shot("2_confirmar_pausa.png");
  await run(`${dialog}.querySelector('input[type=checkbox]').click()`);
  mark = await sentCount();
  check("confirma a pausa", await click("Pausar", dialog));
  await sleep(500);
  check("envia PP,2,1", (await sentSince(mark)).includes("PP,2,1"));
  check("mostra Pausado", (await run(`${footer}.textContent`)).includes("Pausado"));
  await shot("3_pausado.png");

  mark = await sentCount();
  check("retomar sem confirmação", await click("Retomar", footer));
  await sleep(500);
  check("envia PP,2,0", (await sentSince(mark)).includes("PP,2,0"));
  mark = await sentCount();
  await click("Pausar", footer);
  await sleep(300);
  check(
    "não pergunta de novo após marcar a caixa",
    !(await run(`Boolean(${dialog})`)) && (await sentSince(mark)).includes("PP,2,1"),
  );
  await click("Retomar", footer);
  await sleep(400);

  check("parar pede confirmação", (await click("Parar", footer)) && Boolean(await run(`Boolean(${dialog})`)));
  await shot("4_confirmar_parar.png");
  mark = await sentCount();
  check("confirma parar", await click("Parar", dialog));
  await sleep(500);
  check("envia PX,2", (await sentSince(mark)).includes("PX,2"));
  check("mostra Parado", (await run(`${footer}.textContent`)).includes("Parado"));

  check("modo agendar", await click("Agendar", footer));
  await sleep(200);
  const target = await run(`(() => {
    const input = ${footer}.querySelector('input[type="datetime-local"]');
    const d = new Date(Date.now() + 10 * 60000);
    const pad = (n) => String(n).padStart(2, "0");
    const value = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return new Date(value).getTime();
  })()`);
  mark = await sentCount();
  const buttons = await run(`[...${footer}.querySelectorAll("button")].map((b) => b.textContent.trim())`);
  const agendar = await run(`(() => {
    const list = [...${footer}.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Agendar");
    const button = list[list.length - 1];
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  check("envia agendamento", agendar, buttons.join(", "));
  await sleep(900);
  check("PS com horário", (await sentSince(mark)).includes(`PS,2,${target}`));
  check("mostra Agendado", (await run(`${footer}.textContent`)).includes("Agendado"));
  await shot("5_agendado.png");

  const dock = `document.querySelector('aside[aria-label="Programações em andamento"]')`;
  const modalVisible = `Boolean(document.querySelector('[role="dialog"]')?.offsetParent)`;
  await run(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
  await sleep(500);
  check("fechar com programa ativo minimiza", !(await run(modalVisible)) && Boolean(await run(`Boolean(document.querySelector('[role="dialog"]'))`)));
  check("painel flutuante mostra o agendamento", (await run(`${dock}?.textContent ?? ""`)).includes("Agendado"));
  check("reabre pelo painel", (await click("Abrir editor", dock)) && (await run(modalVisible)));
  await sleep(300);
  check("botão minimizar", (await run(`(() => { const b = document.querySelector('[aria-label="Minimizar"]'); b?.click(); return Boolean(b); })()`)));
  await sleep(400);
  check("minimizado de novo", !(await run(modalVisible)) && Boolean(await run(`Boolean(${dock})`)));
  const locked = await run(
    `[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Ligar bomba")?.disabled`,
  );
  check("controles manuais bloqueados", locked === true);
  await run(`[...document.querySelectorAll("p")].find((p) => p.textContent.trim() === "Programação")?.scrollIntoView({ block: "center" })`);
  await sleep(300);
  await shot("6_pagina_bomba.png");

  await run(`location.hash = "#/"`);
  await sleep(1500);
  check("selo no painel", (await run("document.body.textContent")).includes("Agendado"));
  check("painel flutuante segue na tela inicial", Boolean(await run(`Boolean(${dock})`)));
  await shot("7_painel.png");

  await run(`location.hash = "#/configuracoes"`);
  await sleep(1200);
  check(
    "configuração mostra a confirmação de pausa desligada",
    (await run(`[...document.querySelectorAll("button")].find((b) => b.textContent.includes("Pausar programação"))?.textContent`))?.includes("Não perguntar"),
  );

  await run(`location.hash = "#/bomba/1"`);
  await sleep(1200);
  check("adiciona gráfico", await click("Adicionar gráfico"));
  await run(`(() => {
    const slider = document.querySelector('input[aria-label="PWM da bomba"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(slider, "90");
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await sleep(300);
  check("liga no sentido direto", await click("Ligar bomba"));
  await sleep(3000);
  const legend = `[...document.querySelectorAll("span")].filter((s) => /^Vazão -?\\d/.test(s.textContent.trim())).map((s) => s.textContent.trim())[0] ?? ""`;
  const forward = await run(legend);
  check("vazão positiva no direto", /^Vazão \d/.test(forward) && !forward.includes("Vazão 0.0"), forward);
  check("inverte para reverso", await click("Reverso"));
  await sleep(4000);
  const reverse = await run(legend);
  check("vazão negativa no reverso", /^Vazão -\d/.test(reverse), reverse);
  await run(`[...document.querySelectorAll("p")].find((p) => p.textContent.trim() === "Monitoramento")?.scrollIntoView({ block: "start" })`);
  await sleep(300);
  await shot("8_grafico_com_sentido.png");

  await run(`location.hash = "#/configuracoes"`);
  await sleep(1000);
  check("opção sem sentido", await run(`(() => {
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent.startsWith("Sem sentido de rotação"));
    button?.click();
    return Boolean(button);
  })()`));
  await run(`(() => {
    const input = [...document.querySelectorAll("label")].find((l) => l.textContent.startsWith("P01"))?.querySelector("input");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, "100");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.blur();
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  })()`);
  await sleep(300);
  await run(`[...document.querySelectorAll("p")].find((p) => p.textContent.trim() === "Gráficos de vazão e volume")?.scrollIntoView({ block: "start" })`);
  await sleep(300);
  await shot("9_configuracoes_graficos.png");
  await run(`location.hash = "#/bomba/1"`);
  await sleep(1500);
  const absolute = await run(legend);
  check("sem sentido: vazão positiva no reverso", /^Vazão \d/.test(absolute) && !absolute.includes("Vazão 0.0"), absolute);
  const monitorText = await run(`[...document.querySelectorAll("p")].find((p) => p.textContent.includes("amostras"))?.textContent ?? ""`);
  check("volume parte do inicial", monitorText.includes("inicial 100 mL"), monitorText);
  await run(`[...document.querySelectorAll("p")].find((p) => p.textContent.trim() === "Monitoramento")?.scrollIntoView({ block: "start" })`);
  await sleep(300);
  await shot("10_grafico_sem_sentido.png");

  const editor = `document.querySelector('[role="dialog"][aria-labelledby="experiment-title"]')`;
  const nameInput = `document.querySelector('input[aria-label="Nome da programação"]')`;
  const library = `document.querySelector('[aria-label="Biblioteca de programações"]')`;
  const stored = (key) => run(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}) ?? "null")`);
  check("abre o editor da P01", await click("Programar experimento"));
  await sleep(700);
  check("nome padrão", (await run(`${nameInput}.value`)) === "Programação P01");
  await run(`(() => {
    const input = ${nameInput};
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, "Ensaio de rampa");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  })()`);
  await sleep(900);
  check("renomeia com salvamento automático", (await stored("bomba.experiment.v1"))?.[0]?.name === "Ensaio de rampa");
  check("salvar na biblioteca", await click("Salvar", editor));
  await sleep(300);
  const lib = await stored("bomba.program-library.v1");
  check("biblioteca guarda a programação", lib?.length === 1 && lib[0].name === "Ensaio de rampa", JSON.stringify(lib?.map((i) => i.name)));
  check("status na biblioteca", (await run(`${editor}.textContent`)).includes("biblioteca"));
  check("expandir", await run(`(() => { const b = document.querySelector('[aria-label="Expandir"]'); b?.click(); return Boolean(b); })()`));
  await sleep(300);
  check("ocupa a tela inteira", (await run(`${editor}.getBoundingClientRect().width`)) === width);
  await shot("11_editor_expandido.png");
  check("abre a biblioteca", (await click("Abrir", editor)) && Boolean(await run(`Boolean(${library})`)));
  await sleep(200);
  await shot("12_biblioteca.png");
  check("nova programação", await click("Nova programação", library));
  await sleep(300);
  check("nova sem blocos e sem vínculo", (await run(`${nameInput}.value`)) === "Programação P01" && (await run(`${editor}.textContent`)).includes("Rascunho"));
  await click("Abrir", editor);
  await sleep(200);
  check("reabre da biblioteca", await click("Abrir", library));
  await sleep(300);
  check("carrega nome da biblioteca", (await run(`${nameInput}.value`)) === "Ensaio de rampa");
  check("exportar", await click("Exportar", editor));
  await sleep(400);
  check("confirma exportação", (await run(`${editor}.textContent`)).includes("Arquivo exportado"));
  await run(`document.querySelector('[aria-label="Restaurar tamanho"]')?.click()`);
  await run(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
  await sleep(300);
  await send("Page.reload");
  await sleep(2500);
  await click("Programar experimento");
  await sleep(700);
  check("persiste após recarregar", (await run(`${nameInput}.value`)) === "Ensaio de rampa");

  const pauses = () =>
    run(`[...${editor}.querySelectorAll("div")].filter((d) => d.childNodes[0]?.textContent?.trim() === "Pausar por").length`);
  const key = (k, shift = false) =>
    run(`window.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(k)}, ctrlKey: true, shiftKey: ${shift}, bubbles: true, cancelable: true }))`);
  const before = await pauses();
  await run(`document.querySelector('[aria-label="Blocos disponíveis"] [aria-label="Pausar"]').click()`);
  await sleep(200);
  check("adiciona bloco", (await pauses()) === before + 1);
  await key("z");
  await sleep(200);
  check("Ctrl+Z desfaz", (await pauses()) === before);
  await key("y");
  await sleep(200);
  check("Ctrl+Y refaz", (await pauses()) === before + 1);
  await key("z");
  await sleep(200);
  await key("z", true);
  await sleep(200);
  check("Ctrl+Shift+Z refaz", (await pauses()) === before + 1);
  const firstNumber = `${editor}.querySelector('input[type="number"]')`;
  const original = await run(`${firstNumber}.value`);
  for (const value of ["7", "77"]) {
    await run(`(() => {
      const input = ${firstNumber};
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await sleep(100);
  }
  await key("z");
  await sleep(200);
  check("digitação no campo desfaz em um passo", (await run(`${firstNumber}.value`)) === original, `${original} → ${await run(`${firstNumber}.value`)}`);
  check("botão desfazer habilitado", await run(`!document.querySelector('[aria-label="Desfazer (Ctrl+Z)"]').disabled`));

  const setFlow = { id: "f1", kind: "setFlow", fields: { flow: { ref: "varFlow" } } };
  const flow = (id, value) => ({ id, kind: "setFlow", fields: { flow: value } });
  const programs = [
    { name: "Operadores lógicos", docId: null, blocks: [
      { id: "w9", kind: "while", fields: {}, condition: { logic: "and", a: { left: { ref: "varTime" }, op: "<", right: 60 }, b: { logic: "not", a: { ref: "varDir" } } }, children: [{ id: "v9", kind: "invert", fields: {} }] },
      { id: "i9", kind: "if", fields: {}, condition: { logic: "or", a: { ref: "varDir" }, b: { left: { ref: "varVolume" }, op: ">=", right: 100 } }, children: [{ id: "p9", kind: "pause", fields: { seconds: 1 } }] },
    ] },
    null,
    { name: "Condição nova", docId: null, blocks: [{ id: "w1", kind: "while", fields: {}, condition: { left: { ref: "varTime" }, op: "<", right: 60 }, children: [setFlow] }] },
    [{ id: "w2", kind: "while", fields: { threshold: 5 }, children: [{ id: "f2", kind: "setFlow", fields: { flow: 20 } }] }],
    { name: "Se senão", docId: null, blocks: [
      { id: "i1", kind: "if", fields: {}, condition: { ref: "varDir" }, children: [flow("f3", 10)], elseChildren: [flow("f4", 20)] },
      { id: "i2", kind: "if", fields: {}, condition: { left: { ref: "varDir" }, op: "!=", right: 1 }, children: [{ id: "v1", kind: "invert", fields: {} }] },
    ] },
    { name: "Escolha", docId: null, blocks: [
      { id: "s1", kind: "switch", fields: { value: { ref: "varDir" } }, cases: [
        { id: "c1", match: 1, children: [flow("f5", 10)] },
        { id: "c0", match: 0, children: [flow("f6", 20)] },
      ], elseChildren: [{ id: "p1", kind: "pause", fields: { seconds: 5 } }] },
    ] },
  ];
  const inject = await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `if (!sessionStorage.getItem("injetado")) {
      sessionStorage.setItem("injetado", "1");
      localStorage.setItem("bomba.experiment.v1", ${JSON.stringify(JSON.stringify(programs))});
    }`,
  });
  const caseRows = () =>
    run(`[...${editor}.querySelectorAll("div")].filter((d) => d.childNodes[0]?.textContent?.trim() === "caso").length`);
  for (const [pump, expected, label] of [
    [1, ["PI,1,0,Q,-1,<,@T,60,-", "PI,1,1,Q,-1,!,@D,0,-", "PI,1,2,~,-1,-,-,-,-", "PI,1,3,&,-1,-,-,-,-", "PI,1,4,H,6,?,4,-,-", "PI,1,6,E,4,-,-,-,-", "PI,1,9,|,-1,-,-,-,-", "PI,1,10,C,12,?,3,-,-"], "e, ou e não viram condição pós-fixa antes do H/C"],
    [3, ["PI,3,0,H,2,<,@T,60,-"], "condição com tempo envia H,<,@T,60"],
    [4, ["PI,4,0,H,2,>,5,-,-"], "programa antigo segue no formato PROG1"],
    [5, ["PI,5,0,C,2,!,@D,0,-", "PI,5,2,N,4,-,-,-,-", "PI,5,4,E,0,-,-,-,-", "PI,5,5,C,7,!,@D,1,-"], "se/senão com Sentido e ≠ envia C, N e E"],
    [6, ["PI,6,0,C,2,=,@D,1,-", "PI,6,2,N,8,-,-,-,-", "PI,6,3,C,5,=,@D,0,-", "PI,6,6,W,-1,-,5,-,-", "PI,6,7,E,3,-,-,-,-", "PI,6,8,E,0,-,-,-,-"], "escolha/caso vira cadeia de C = com N"],
  ]) {
    await run(`location.hash = "#/bomba/${pump}"`);
    await send("Page.reload");
    await sleep(2500);
    await click("Conectar");
    await sleep(900);
    await click("Programar experimento");
    await sleep(700);
    if (pump >= 5 || pump === 1) {
      await run(`document.querySelector('[aria-label="Expandir"]')?.click()`);
      await sleep(400);
      await shot(`${pump === 1 ? "15_operadores_logicos" : pump === 5 ? "13_se_senao" : "14_escolha_caso"}.png`);
      await run(`document.querySelector('[aria-label="Restaurar tamanho"]')?.click()`);
      await sleep(200);
    }
    if (pump === 6) {
      const rows = await caseRows();
      check("+ caso acrescenta um caso", (await click("+ caso", editor)) && (await caseRows()) === rows + 1, `${rows}`);
      await key("z");
      await sleep(200);
      check("Ctrl+Z desfaz o caso", (await caseRows()) === rows);
    }
    if (pump === 5) {
      const elseBars = () =>
        run(`[...${editor}.querySelectorAll("div.whitespace-nowrap")].filter((d) => d.childNodes[0]?.textContent?.trim() === "senão" && d.querySelector("button")).length`);
      const removeElse = await run(`(() => {
        const b = ${editor}.querySelector('button[aria-label^="Remover o braço"]');
        b?.click();
        return Boolean(b);
      })()`);
      await sleep(200);
      check("× remove o senão", removeElse && (await elseBars()) === 0);
      check("+ senão devolve o braço", (await click("+ senão", editor)) && (await elseBars()) === 1);
      await key("z");
      await key("z");
      await sleep(200);
      check("desfaz volta ao senão original", (await elseBars()) === 1);
    }
    mark = await sentCount();
    await click("Executar agora", footer);
    await sleep(900);
    const lines = await sentSince(mark);
    check(label, expected.every((line) => lines.includes(line)), lines.filter((l) => l.startsWith("PI")).join(" | "));
    await click("Parar", footer);
    await sleep(200);
    await click("Parar", dialog);
    await sleep(300);
  }
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: inject.result.identifier });
  ws.close();
} finally {
  browser.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

console.log(failures.length ? `\n${failures.length} falha(s)` : "\ntudo certo");
process.exit(failures.length ? 1 : 0);
