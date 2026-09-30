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

/** Braço de um bloco em C: espaço interno seguido da barra abaixo dele. */
export type CSection = { innerH: number; barW: number; barH: number };

/** Bloco em C com um ou mais braços (senão, casos); a última barra é a base do bloco. */
export function multiCPath(topW: number, topH: number, sections: CSection[], m: BlockMetrics) {
  const r = m.radius;
  const nx = m.notchX;
  const arm = m.armW;
  const parts = [
    `M 0,${r}`,
    arc(r, r, -r),
    `H ${nx} ${notchRight(m)}`,
    `H ${topW - r}`,
    arc(r, r, r),
    `V ${topH - r}`,
    arc(r, -r, r),
  ];
  let y = topH;
  for (const section of sections) {
    const ri = Math.min(r, section.innerH / 2);
    const rb = Math.min(r, section.barH / 2);
    const innerBottom = y + section.innerH;
    parts.push(
      `H ${arm + nx + m.notchW} ${notchLeft(m)}`,
      `H ${arm + ri}`,
      arc(ri, -ri, ri, 0),
      `V ${innerBottom - ri}`,
      arc(ri, ri, ri, 0),
      `H ${arm + nx} ${notchRight(m)}`,
      `H ${section.barW - rb}`,
      arc(rb, rb, rb),
      `V ${innerBottom + section.barH - rb}`,
      arc(rb, -rb, rb),
    );
    y = innerBottom + section.barH;
  }
  parts.push(`H ${nx + m.notchW} ${notchLeft(m)}`, `H ${r}`, arc(r, -r, -r), "Z");
  return parts.join(" ");
}

/** Bloco em C (laços e condições): barra superior, braço esquerdo e barra inferior. */
export function cBlockPath(
  topW: number,
  topH: number,
  innerH: number,
  bottomW: number,
  m: BlockMetrics,
) {
  return multiCPath(topW, topH, [{ innerH, barW: bottomW, barH: m.bottomH }], m);
}

export const OUTPUT_TAB_W = 6;

/** Bloco de valor (variável): cantos arredondados e encaixe saliente à esquerda, fora da caixa. */
export function reporterPath(w: number, h: number) {
  const r = Math.min(4, h / 2);
  const ty = Math.min(5, h / 4);
  const th = Math.max(6, Math.min(14, h - ty * 2));
  const tw = OUTPUT_TAB_W;
  return [
    `M ${r},0`,
    `H ${w - r}`,
    arc(r, r, r),
    `V ${h - r}`,
    arc(r, -r, r),
    `H ${r}`,
    arc(r, -r, -r),
    `V ${ty + th}`,
    `c ${-tw * 1.3},0 ${-tw * 1.3},${-th} 0,${-th}`,
    `V ${r}`,
    arc(r, r, -r),
    "Z",
  ].join(" ");
}

/** Bloco de condição: hexágono com pontas à esquerda e à direita. */
export function booleanPath(w: number, h: number) {
  const p = Math.min(h * 0.38, w / 2);
  return `M ${p},0 H ${w - p} L ${w},${h / 2} L ${w - p},${h} H ${p} L 0,${h / 2} Z`;
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
