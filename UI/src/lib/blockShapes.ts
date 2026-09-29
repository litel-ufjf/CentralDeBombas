export type BlockMetrics = {
  radius: number;
  notchX: number;
  notchW: number;
  notchH: number;
  armW: number;
  bottomH: number;
  minH: number;
};

export const BLOCK_MD: BlockMetrics = {
  radius: 7,
  notchX: 14,
  notchW: 15,
  notchH: 5,
  armW: 20,
  bottomH: 24,
  minH: 36,
};

export const BLOCK_SM: BlockMetrics = {
  radius: 6,
  notchX: 11,
  notchW: 13,
  notchH: 4,
  armW: 14,
  bottomH: 11,
  minH: 26,
};

function notchRight(m: BlockMetrics) {
  const side = (m.notchW - 3) / 2;
  const c1 = side * 0.42;
  const c2 = side * 0.58;
  return `c ${c1},0 ${c2},${m.notchH} ${side},${m.notchH} h 3 c ${side - c2},0 ${side - c1},${-m.notchH} ${side},${-m.notchH}`;
}

function notchLeft(m: BlockMetrics) {
  const side = (m.notchW - 3) / 2;
  const c1 = side * 0.42;
  const c2 = side * 0.58;
  return `c ${-c1},0 ${-c2},${m.notchH} ${-side},${m.notchH} h -3 c ${-(side - c2)},0 ${-(side - c1)},${-m.notchH} ${-side},${-m.notchH}`;
}

function arc(r: number, dx: number, dy: number, sweep: 0 | 1 = 1) {
  return `a ${r},${r} 0 0 ${sweep} ${dx},${dy}`;
}

/** Bloco de instrução: entalhe no topo e encaixe saliente embaixo. */
export function statementPath(
  w: number,
  h: number,
  m: BlockMetrics,
  { top = true, bottom = true }: { top?: boolean; bottom?: boolean } = {},
) {
  const r = Math.min(m.radius, h / 2, w / 2);
  const nx = m.notchX;
  return [
    `M 0,${r}`,
    arc(r, r, -r),
    top ? `H ${nx} ${notchRight(m)}` : "",
    `H ${w - r}`,
    arc(r, r, r),
    `V ${h - r}`,
    arc(r, -r, r),
    bottom ? `H ${nx + m.notchW} ${notchLeft(m)}` : "",
    `H ${r}`,
    arc(r, -r, -r),
    "Z",
  ].join(" ");
}

/** Bloco em C (laços e condições): barra superior, braço esquerdo e barra inferior. */
export function cBlockPath(
  topW: number,
  topH: number,
  innerH: number,
  bottomW: number,
  m: BlockMetrics,
) {
  const r = m.radius;
  const nx = m.notchX;
  const arm = m.armW;
  const ri = Math.min(r, innerH / 2);
  const yInnerBottom = topH + innerH;
  const total = yInnerBottom + m.bottomH;
  return [
    `M 0,${r}`,
    arc(r, r, -r),
    `H ${nx} ${notchRight(m)}`,
    `H ${topW - r}`,
    arc(r, r, r),
    `V ${topH - r}`,
    arc(r, -r, r),
    `H ${arm + nx + m.notchW} ${notchLeft(m)}`,
    `H ${arm + ri}`,
    arc(ri, -ri, ri, 0),
    `V ${yInnerBottom - ri}`,
    arc(ri, ri, ri, 0),
    `H ${arm + nx} ${notchRight(m)}`,
    `H ${bottomW - r}`,
    arc(r, r, r),
    `V ${total - r}`,
    arc(r, -r, r),
    `H ${nx + m.notchW} ${notchLeft(m)}`,
    `H ${r}`,
    arc(r, -r, -r),
    "Z",
  ].join(" ");
}

/** Escurece (amount > 0) ou clareia (amount < 0) uma cor hexadecimal. */
export function shade(hex: string, amount: number) {
  const value = hex.replace("#", "");
  const n = parseInt(value, 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(amount >= 0 ? c * (1 - amount) : c + (255 - c) * -amount),
  );
  return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
