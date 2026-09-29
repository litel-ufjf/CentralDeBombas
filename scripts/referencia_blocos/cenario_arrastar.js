(async () => {
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  const dialog = document.querySelector("[role=dialog]");
  const log = [];

  const fire = (element, type, dataTransfer, x, y) =>
    element.dispatchEvent(
      new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, clientX: x, clientY: y }),
    );

  const paletteItem = (label) => dialog.querySelector(`[role=button][aria-label="${label}"]`);
  const canvasBlock = (prefix) =>
    [...dialog.querySelectorAll('[draggable="true"]:not([role=button])')].find((node) =>
      node.textContent.trim().startsWith(prefix),
    );

  async function drag(source, target, fy = 0.75, fx = 0.3) {
    const dataTransfer = new DataTransfer();
    fire(source, "dragstart", dataTransfer, 0, 0);
    await wait(60);
    const box = target.getBoundingClientRect();
    const x = box.left + box.width * fx;
    const y = box.top + box.height * fy;
    fire(document.elementFromPoint(x, y), "dragenter", dataTransfer, x, y);
    fire(document.elementFromPoint(x, y), "dragover", dataTransfer, x, y);
    await wait(80);
    fire(document.elementFromPoint(x, y), "dragover", dataTransfer, x, y);
    await wait(60);
    fire(document.elementFromPoint(x, y), "drop", dataTransfer, x, y);
    fire(source, "dragend", dataTransfer, x, y);
    await wait(150);
  }

  const order = () =>
    [...dialog.querySelectorAll('[draggable="true"]:not([role=button])')].map(
      (node) => node.firstElementChild?.textContent?.trim().split(/\s+/).slice(0, 2).join(" ") ?? "?",
    );

  log.push("início: " + order().join(" | "));

  await drag(paletteItem("Definir Vazão"), canvasBlock("Pausar por"), 0.8);
  log.push("paleta→depois de Pausar: " + order().join(" | "));

  await drag(canvasBlock("Definir vazão"), canvasBlock("Pausar por"), 0.2);
  log.push("Definir acima de Pausar: " + order().join(" | "));

  const pauseInput = canvasBlock("Pausar por").querySelector("input");
  await drag(paletteItem("Vazão Atual"), pauseInput, 0.5, 0.5);
  log.push("variável no campo de Pausar: " + canvasBlock("Pausar por").textContent.trim());

  await drag(canvasBlock("Rampa de Vazão"), dialog.querySelector('[aria-label^="Lixeira"]'), 0.5, 0.5);
  log.push("Rampa na lixeira: " + order().join(" | "));

  await drag(paletteItem("Vazão Senoidal"), canvasBlock("Para iterando"), 0.02, 0.2);
  log.push("Senoidal antes do laço: " + order().join(" | "));

  return log.join("\n");
})()
