"""Compara o print do modal com a imagem de referência.

Uso: python comparar.py referencia.png atual.png [prefixo_saida]

1. Redimensiona o print atual para a resolução da referência.
2. Segmenta os blocos por cor (HSV) e mede as caixas envolventes por categoria.
3. Extrai bordas (Canny) de ambos e sobrepõe: vermelho = referência, ciano = atual.
4. Calcula a concordância de bordas (F1 com tolerância de 2 px) por região.
"""

import sys

import cv2
import numpy as np

REGIONS = {
    "modal": (240, 70, 785, 490),
    "paleta": (243, 115, 405, 480),
    "area_blocos": (470, 150, 680, 300),
    "controles": (730, 360, 775, 470),
}

# Faixas HSV (OpenCV: H 0-180) das cores das categorias.
CATEGORIES = {
    "azul_logica": ((100, 90, 90), (112, 255, 230)),
    "verde_acao": ((55, 70, 70), (75, 255, 220)),
    "laranja_perfil": ((10, 150, 150), (20, 255, 255)),
    "vermelho_es": ((0, 90, 90), (6, 255, 230)),
}


def load(path, size=None):
    image = cv2.imread(path, cv2.IMREAD_COLOR)
    if image is None:
        raise SystemExit(f"não abriu {path}")
    if size is not None and (image.shape[1], image.shape[0]) != size:
        image = cv2.resize(image, size, interpolation=cv2.INTER_AREA)
    return image


def crop(image, box):
    x0, y0, x1, y1 = box
    return image[y0:y1, x0:x1]


def edges(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    return cv2.Canny(gray, 40, 110)


def edge_f1(a, b, tolerance=2):
    kernel = np.ones((2 * tolerance + 1, 2 * tolerance + 1), np.uint8)
    a_near = cv2.dilate(a, kernel) > 0
    b_near = cv2.dilate(b, kernel) > 0
    a_on = a > 0
    b_on = b > 0
    if not a_on.any() or not b_on.any():
        return 0.0
    precision = (b_on & a_near).sum() / b_on.sum()
    recall = (a_on & b_near).sum() / a_on.sum()
    return 0.0 if precision + recall == 0 else 2 * precision * recall / (precision + recall)


def category_boxes(image, box):
    hsv = cv2.cvtColor(crop(image, box), cv2.COLOR_BGR2HSV)
    result = {}
    for name, (low, high) in CATEGORIES.items():
        mask = cv2.inRange(hsv, np.array(low), np.array(high))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
        count, _, stats, _ = cv2.connectedComponentsWithStats(mask)
        blobs = [
            (int(x + box[0]), int(y + box[1]), int(w), int(h))
            for x, y, w, h, area in stats[1:]
            if area > 25
        ]
        result[name] = sorted(blobs, key=lambda b: (b[1], b[0]))
    return result


def overlay(ref_edges, cur_edges):
    canvas = np.full((*ref_edges.shape, 3), 255, np.uint8)
    canvas[ref_edges > 0] = (40, 40, 220)
    canvas[cur_edges > 0] = (200, 180, 0)
    canvas[(ref_edges > 0) & (cur_edges > 0)] = (30, 30, 30)
    return canvas


def main():
    ref_path, cur_path = sys.argv[1], sys.argv[2]
    prefix = sys.argv[3] if len(sys.argv) > 3 else "comparacao"
    ref = load(ref_path)
    cur = load(cur_path, (ref.shape[1], ref.shape[0]))

    print("região         F1 bordas")
    for name, box in REGIONS.items():
        score = edge_f1(edges(crop(ref, box)), edges(crop(cur, box)))
        print(f"{name:<14} {score:.3f}")

    print("\nblocos por cor (x, y, largura, altura) na escala da referência")
    for name, box in (("paleta", REGIONS["paleta"]), ("area", (410, 118, 775, 480))):
        ref_boxes = category_boxes(ref, box)
        cur_boxes = category_boxes(cur, box)
        for category in CATEGORIES:
            if ref_boxes[category] or cur_boxes[category]:
                print(f"[{name}] {category}")
                print(f"   ref:   {ref_boxes[category][:6]}")
                print(f"   atual: {cur_boxes[category][:6]}")

    for name, box in REGIONS.items():
        a = crop(ref, box)
        b = crop(cur, box)
        scale = 3 if name != "modal" else 2
        size = (a.shape[1] * scale, a.shape[0] * scale)
        a = cv2.resize(a, size, interpolation=cv2.INTER_CUBIC)
        b = cv2.resize(b, size, interpolation=cv2.INTER_CUBIC)
        gap = np.full((a.shape[0], 12, 3), 255, np.uint8)
        side = np.hstack([a, gap, b])
        edge_map = overlay(edges(a), edges(b))
        cv2.imwrite(f"{prefix}_{name}_lado_a_lado.png", side)
        cv2.imwrite(f"{prefix}_{name}_bordas.png", edge_map)


if __name__ == "__main__":
    main()
