(async () => {
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  const dialog = document.querySelector("[role=dialog]");
  const source = dialog.querySelector('[role=button][aria-label="Inverter Rotação"]');
  const target = [...dialog.querySelectorAll('[draggable="true"]:not([role=button])')].find((node) =>
    node.textContent.trim().startsWith("Pausar por"),
  );
  const dataTransfer = new DataTransfer();
  source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
  await wait(60);
  const box = target.getBoundingClientRect();
  const x = box.left + 30;
  const y = box.top + 6;
  for (let i = 0; i < 3; i += 1) {
    document
      .elementFromPoint(x, y)
      .dispatchEvent(
        new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer, clientX: x, clientY: y }),
      );
    await wait(60);
  }
  return "marcador antes de Pausar";
})()
