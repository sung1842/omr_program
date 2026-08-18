"""Vercel Python serverless OMR endpoint.

Dependencies are limited to opencv-python-headless and numpy so the
uncompressed function stays within the Hobby 50MB envelope.

Scoring uses fixed template coordinates after warping the 15 기표 rows
(not the 인적사항 bar) onto the template cells.
Do not re-detect the 15 기표 circles; Hough/grid overlay shifts them.
"""

from __future__ import annotations

import base64
import json
import traceback
from http.server import BaseHTTPRequestHandler
from typing import Any

import cv2
import numpy as np

MAX_PAYLOAD = int(4.5 * 1024 * 1024)
MAX_WORKING_SIDE = 2200
MARKER_SEARCH_RATIO = 0.28
MIN_MARKER_AREA_RATIO = 0.00012
MAX_MARKER_AREA_RATIO = 0.03
CIRCULARITY_MIN = 0.55

# Overlay 2224x2868: printed circle r=21. Coordinates stay fixed.
# Fill is measured on an 8x upsampled disk so coverage is sub-pixel.
SUBPIXEL_SCALE = 8
# Inner disk only (skip printed ring). Lower = more sensitive.
HOLE_SCALE = 0.78
FILL_CUT = 0.28
ENGINE = "cell_circle_v1"
MARK_ROWS = 15
# 인적사항 띠 위에 앉으면 p90 paper가 이보다 어둡다. 그 칸은 마킹이 아니다.
BANNER_PAPER = 130.0

# Measured circle placement inside a 기표 cell (152x101 → 42x42 at +93,+29.5).
# Printed circle sits on the right of the cell, vertically centered.
CIRCLE_IN_CELL_X = 93.0 / 152.0
CIRCLE_IN_CELL_Y = 29.5 / 101.0
CIRCLE_IN_CELL_W = 42.0 / 152.0
CIRCLE_IN_CELL_H = 42.0 / 101.0

ERROR_MESSAGES = {
    "PAYLOAD_TOO_LARGE": "용량 초과 (4.5MB 제한)",
    "IMAGE_DECODE_FAILED": "이미지 손상 또는 디코딩 실패",
    "INVALID_TEMPLATE": "템플릿 데이터가 올바르지 않습니다.",
    "MARKERS_NOT_FOUND": "모서리 기준점 인식 실패",
    "PERSPECTIVE_FAILED": "투시 변환 실패",
    "ROI_OUT_OF_BOUNDS": "마킹 영역이 이미지 범위를 벗어났습니다.",
    "INTERNAL": "서버 내부 오류",
}


class OmrError(Exception):
    def __init__(self, status: int, code: str, message: str | None = None):
        self.status = status
        self.code = code
        self.message = message or ERROR_MESSAGES.get(code, ERROR_MESSAGES["INTERNAL"])
        super().__init__(self.message)


def _json_bytes(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _validate_template(template: Any) -> dict[str, Any]:
    if not isinstance(template, dict):
        raise OmrError(400, "INVALID_TEMPLATE")

    markers = template.get("markers")
    questions = template.get("questions")
    if not isinstance(markers, list) or len(markers) != 4:
        raise OmrError(400, "INVALID_TEMPLATE", "기준점(Marker)이 4개여야 합니다.")
    if not isinstance(questions, list) or len(questions) == 0:
        raise OmrError(400, "INVALID_TEMPLATE", "문항 ROI가 없습니다.")

    image_width = int(_as_float(template.get("image_width"), 0))
    image_height = int(_as_float(template.get("image_height"), 0))
    if image_width < 32 or image_height < 32:
        raise OmrError(400, "INVALID_TEMPLATE", "템플릿 이미지 크기가 유효하지 않습니다.")

    for marker in markers:
        if not isinstance(marker, dict):
            raise OmrError(400, "INVALID_TEMPLATE")
        for key in ("x", "y", "w", "h"):
            if key not in marker:
                raise OmrError(400, "INVALID_TEMPLATE", "기준점 좌표가 불완전합니다.")

    for question in questions:
        if not isinstance(question, dict):
            raise OmrError(400, "INVALID_TEMPLATE")
        options = question.get("options")
        if not isinstance(options, list) or len(options) == 0:
            raise OmrError(400, "INVALID_TEMPLATE", "문항에 선택지 ROI가 없습니다.")

    return template


def _decode_image(image_base64: Any) -> np.ndarray:
    if not isinstance(image_base64, str) or not image_base64.strip():
        raise OmrError(400, "IMAGE_DECODE_FAILED")

    payload = image_base64.strip()
    if payload.startswith("data:") and "," in payload:
        payload = payload.split(",", 1)[1]

    try:
        raw = base64.b64decode(payload, validate=False)
    except Exception as exc:
        raise OmrError(400, "IMAGE_DECODE_FAILED") from exc

    if len(raw) > MAX_PAYLOAD:
        raise OmrError(413, "PAYLOAD_TOO_LARGE")

    arr = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        raise OmrError(400, "IMAGE_DECODE_FAILED")
    return image


def _binarize(gray: np.ndarray) -> np.ndarray:
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    binary = cv2.adaptiveThreshold(
        blurred,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        31,
        8,
    )
    kernel = np.ones((3, 3), np.uint8)
    return cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)


def _downscale(gray: np.ndarray) -> tuple[np.ndarray, float]:
    height, width = gray.shape[:2]
    side = max(height, width)
    if side <= MAX_WORKING_SIDE:
        return gray, 1.0
    scale = MAX_WORKING_SIDE / float(side)
    resized = cv2.resize(
        gray,
        (max(1, int(width * scale)), max(1, int(height * scale))),
        interpolation=cv2.INTER_AREA,
    )
    return resized, scale


def _contour_ok(contour: np.ndarray, shape: str, image_area: float) -> bool:
    area = cv2.contourArea(contour)
    if area < image_area * MIN_MARKER_AREA_RATIO or area > image_area * MAX_MARKER_AREA_RATIO:
        return False

    _x, _y, width, height = cv2.boundingRect(contour)
    if width < 4 or height < 4:
        return False
    aspect = width / float(height)
    if aspect < 0.45 or aspect > 2.2:
        return False

    perimeter = cv2.arcLength(contour, True)
    if perimeter <= 0:
        return False

    if shape == "circle":
        circularity = 4.0 * np.pi * area / (perimeter * perimeter)
        return circularity >= CIRCULARITY_MIN

    approx = cv2.approxPolyDP(contour, 0.04 * perimeter, True)
    return 4 <= len(approx) <= 8


def _collect_candidates(
    binary: np.ndarray, shape: str
) -> list[tuple[float, float, float, int, int, int, int]]:
    height, width = binary.shape[:2]
    image_area = float(height * width)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates: list[tuple[float, float, float, int, int, int, int]] = []

    for contour in contours:
        if not _contour_ok(contour, shape, image_area):
            continue
        x, y, bw, bh = cv2.boundingRect(contour)
        roi = binary[y : y + bh, x : x + bw]
        if roi.size == 0:
            continue
        fill = float(np.mean(roi) / 255.0)
        if fill < 0.32:
            continue
        cx = x + bw / 2.0
        cy = y + bh / 2.0
        candidates.append((cx, cy, fill, x, y, bw, bh))

    return candidates


def _assign_markers(
    candidates: list[tuple[float, float, float, int, int, int, int]],
    markers: list[dict[str, Any]],
    width: int,
    height: int,
) -> dict[str, tuple[float, float]]:
    if len(candidates) < 4:
        raise OmrError(400, "MARKERS_NOT_FOUND")

    expected: list[tuple[str, float, float]] = []
    for marker in markers:
        mid = str(marker.get("id") or "")
        ex = (_as_float(marker["x"]) + _as_float(marker["w"]) / 2.0) * width
        ey = (_as_float(marker["y"]) + _as_float(marker["h"]) / 2.0) * height
        expected.append((mid or f"{ex:.0f}:{ey:.0f}", ex, ey))

    max_dist_sq = (MARKER_SEARCH_RATIO * float(np.hypot(width, height))) ** 2
    used: set[int] = set()
    assigned: dict[str, tuple[float, float]] = {}

    for mid, ex, ey in expected:
        best_i = -1
        best_d = float("inf")
        for index, candidate in enumerate(candidates):
            if index in used:
                continue
            dist = (candidate[0] - ex) ** 2 + (candidate[1] - ey) ** 2
            if dist < best_d:
                best_d = dist
                best_i = index
        if best_i < 0 or best_d > max_dist_sq:
            assigned = {}
            break
        used.add(best_i)
        assigned[mid] = (candidates[best_i][0], candidates[best_i][1])

    if len(assigned) == 4:
        return assigned

    corners = [("tl", 0.0, 0.0), ("tr", float(width), 0.0), ("br", float(width), float(height)), ("bl", 0.0, float(height))]
    used.clear()
    fallback: dict[str, tuple[float, float]] = {}
    for mid, ex, ey in corners:
        best_i = -1
        best_d = float("inf")
        for index, candidate in enumerate(candidates):
            if index in used:
                continue
            dist = (candidate[0] - ex) ** 2 + (candidate[1] - ey) ** 2
            if dist < best_d:
                best_d = dist
                best_i = index
        if best_i < 0:
            raise OmrError(400, "MARKERS_NOT_FOUND")
        used.add(best_i)
        fallback[mid] = (candidates[best_i][0], candidates[best_i][1])

    if len(fallback) < 4:
        raise OmrError(400, "MARKERS_NOT_FOUND")
    return fallback


def _marker_dest(marker: dict[str, Any], mode: str) -> tuple[float, float]:
    x = _as_float(marker["x"])
    y = _as_float(marker["y"])
    w = _as_float(marker["w"])
    h = _as_float(marker["h"])
    if mode == "corner":
        # 1234.pdf prompt stores the table corner in x,y. w,h is only the UI box.
        return x, y
    return x + w / 2.0, y + h / 2.0


def _ordered_points(
    assigned: dict[str, tuple[float, float]],
    markers: list[dict[str, Any]],
    dest_mode: str = "center",
) -> tuple[np.ndarray, np.ndarray]:
    id_to_marker = {str(marker.get("id") or ""): marker for marker in markers}
    if set(assigned.keys()) >= {"tl", "tr", "br", "bl"}:
        order = ["tl", "tr", "br", "bl"]
    else:
        order = [str(marker.get("id") or "") for marker in markers]

    src = []
    dst = []
    for mid in order:
        if mid not in assigned:
            raise OmrError(400, "MARKERS_NOT_FOUND")
        src.append(assigned[mid])
        marker = id_to_marker.get(mid) or next(
            (item for item in markers if str(item.get("id") or "") == mid),
            None,
        )
        if marker is None:
            raise OmrError(400, "INVALID_TEMPLATE")
        dst.append(_marker_dest(marker, dest_mode))
    return np.array(src, dtype=np.float32), np.array(dst, dtype=np.float32)


def _warp(
    gray: np.ndarray,
    assigned: dict[str, tuple[float, float]],
    template: dict[str, Any],
    dest_mode: str = "center",
) -> np.ndarray:
    width = int(template["image_width"])
    height = int(template["image_height"])
    src_mode = "corner" if dest_mode in ("corner", "data_rows") else dest_mode
    src, dst_rel = _ordered_points(assigned, template["markers"], src_mode)
    if dest_mode == "data_rows":
        data = _data_row_corners(template)
        if data is not None:
            dst_rel = np.array([data[key] for key in ("tl", "tr", "br", "bl")], dtype=np.float32)
    dst = np.column_stack((dst_rel[:, 0] * width, dst_rel[:, 1] * height)).astype(np.float32)
    try:
        matrix = cv2.getPerspectiveTransform(src, dst)
        warped = cv2.warpPerspective(gray, matrix, (width, height))
    except Exception as exc:
        raise OmrError(400, "PERSPECTIVE_FAILED") from exc
    if warped is None or warped.size == 0:
        raise OmrError(400, "PERSPECTIVE_FAILED")
    return warped


def _order_corners(points: np.ndarray) -> dict[str, tuple[float, float]]:
    pts = points.astype(np.float32).reshape(-1, 2)
    sums = pts[:, 0] + pts[:, 1]
    diffs = pts[:, 0] - pts[:, 1]
    tl = pts[int(np.argmin(sums))]
    br = pts[int(np.argmax(sums))]
    tr = pts[int(np.argmax(diffs))]
    bl = pts[int(np.argmin(diffs))]
    return {
        "tl": (float(tl[0]), float(tl[1])),
        "tr": (float(tr[0]), float(tr[1])),
        "br": (float(br[0]), float(br[1])),
        "bl": (float(bl[0]), float(bl[1])),
    }


def _find_table_quad(binary: np.ndarray) -> dict[str, tuple[float, float]] | None:
    height, width = binary.shape[:2]
    image_area = float(height * width)
    for mode in (cv2.RETR_EXTERNAL, cv2.RETR_LIST):
        contours, _ = cv2.findContours(binary, mode, cv2.CHAIN_APPROX_SIMPLE)
        best = None
        best_area = 0.0
        for contour in contours:
            area = float(cv2.contourArea(contour))
            if area < image_area * 0.16 or area > image_area * 0.82:
                continue
            peri = cv2.arcLength(contour, True)
            if peri <= 0:
                continue
            approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
            if len(approx) == 4 and area > best_area:
                best_area = area
                best = approx
        if best is not None:
            return _order_corners(best)
    return None


def _cluster_positions(indices: np.ndarray, gap: int = 6) -> list[tuple[int, int]]:
    if indices.size == 0:
        return []
    clusters: list[tuple[int, int]] = []
    start = prev = int(indices[0])
    for value in indices[1:]:
        current = int(value)
        if current - prev <= gap:
            prev = current
            continue
        clusters.append((start, prev))
        start = prev = current
    clusters.append((start, prev))
    return clusters


def _drop_border_clusters(clusters: list[tuple[int, int]], limit: int) -> list[tuple[int, int]]:
    margin = limit * 0.012
    inner = [
        pair
        for pair in clusters
        if margin < (pair[0] + pair[1]) / 2.0 < limit - margin
    ]
    return inner or clusters


def _line_centers(score: np.ndarray, fraction: float, limit: int) -> list[float]:
    if score.size == 0 or score.max() <= 0:
        return []
    clusters = _drop_border_clusters(
        _cluster_positions(np.where(score >= score.max() * fraction)[0]),
        limit,
    )
    return [(pair[0] + pair[1]) / 2.0 for pair in clusters]


def _extend_table_edge(strong: list[float], weak: list[float], width: float) -> tuple[float, float] | None:
    if len(strong) < 2:
        return None
    left, right = strong[0], strong[-1]
    extra_right = [x for x in weak if x > right + width * 0.012]
    extra_left = [x for x in weak if x < left - width * 0.012]
    if extra_right:
        candidate = extra_right[-1]
        span = candidate - right
        if width * 0.028 <= span <= width * 0.14:
            right = candidate
    if extra_left:
        candidate = extra_left[0]
        span = left - candidate
        if width * 0.028 <= span <= width * 0.14:
            left = candidate
    return left, right


def _banner_top(gray: np.ndarray) -> int:
    """Top of the dark 인적사항 bar. Search the table body, not the 기표 column."""
    height, width = gray.shape[:2]
    band = gray[:, int(width * 0.12) : int(width * 0.78)]
    means = np.mean(band, axis=1)
    start = int(height * 0.42)
    stop = int(height * 0.92)
    for y in range(start, stop):
        window = means[y : y + 16]
        if window.size < 16:
            break
        if float(np.mean(window)) < 88 and float(np.max(window)) < 125:
            return max(int(height * 0.28), y - 4)
    return int(height * 0.78)


def _row_line_span(values: list[float], count: int, y_end: float) -> list[float] | None:
    """`count` horizontal lines (15 rows → 16 lines) whose last line sits just above 인적사항."""
    if len(values) < count:
        return None
    best: list[float] | None = None
    best_cost = 1e18
    for start in range(0, len(values) - count + 1):
        chunk = values[start : start + count]
        gaps = np.diff(np.array(chunk, dtype=np.float64))
        if gaps.size == 0 or float(np.min(gaps)) < 12:
            continue
        if float(np.max(gaps)) > float(np.min(gaps)) * 2.2:
            continue
        cost = abs(chunk[-1] - y_end) + 0.04 * float(np.var(gaps))
        if cost < best_cost:
            best_cost = cost
            best = [float(item) for item in chunk]
    return best


def _data_row_corners(template: dict[str, Any]) -> dict[str, tuple[float, float]] | None:
    """Dest quad = 15 기표 cells (not the page header / 인적사항)."""
    options = [
        option
        for question in template.get("questions") or []
        for option in question.get("options") or []
    ]
    markers = {str(marker.get("id") or ""): marker for marker in template.get("markers") or []}
    if len(options) < 2 or not {"tl", "tr", "br", "bl"} <= set(markers):
        return None
    x0 = _as_float(markers["tl"]["x"])
    x1 = _as_float(markers["tr"]["x"])
    y0 = _as_float(options[0]["y"])
    y1 = _as_float(options[-1]["y"]) + _as_float(options[-1]["h"])
    if y1 - y0 < 0.18 or x1 - x0 < 0.35:
        return None
    return {
        "tl": (x0, y0),
        "tr": (x1, y0),
        "br": (x1, y1),
        "bl": (x0, y1),
    }


def _find_table_corners_from_lines(
    binary: np.ndarray,
    y_limit: int | None = None,
) -> dict[str, tuple[float, float]] | None:
    """15 기표 rows, including the thin 기표란 border. Stops at 인적사항."""
    height, width = binary.shape[:2]
    if y_limit is None:
        y_limit = int(height * 0.70)
    y_limit = max(8, min(int(y_limit), height - 1))
    roi = binary[:y_limit, :]
    horiz = cv2.morphologyEx(
        roi,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (max(15, width // 22), 1)),
    )
    vert = cv2.morphologyEx(
        roi,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(15, height // 40))),
    )
    row_score = np.sum(horiz > 0, axis=1).astype(np.float64)
    col_score = np.sum(vert > 0, axis=0).astype(np.float64)
    if row_score.max() < width * 0.18 or col_score.max() < y_limit * 0.10:
        return None
    y_centers = _line_centers(row_score, 0.42, y_limit)
    strong_x = _line_centers(col_score, 0.42, width)
    weak_x = _line_centers(col_score, 0.22, width)
    edges = _extend_table_edge(strong_x, weak_x, float(width))
    if len(y_centers) < 2 or edges is None:
        return None
    x_left, x_right = edges
    y_top, y_bot = y_centers[0], y_centers[-1]
    gaps = np.diff(np.array(y_centers, dtype=np.float64))
    pitch = float(np.median(gaps)) if gaps.size else 0.0
    span = _row_line_span(y_centers, MARK_ROWS + 1, float(y_limit - 6))
    if span is not None:
        y_top, y_bot = span[0], span[-1]
    elif pitch >= 8 and len(y_centers) >= 12:
        match = np.abs(gaps - pitch) <= pitch * 0.20
        best_s = best_e = 0
        index = 0
        while index < match.size:
            if not match[index]:
                index += 1
                continue
            end = index
            while end < match.size and match[end]:
                end += 1
            if end - index > best_e - best_s:
                best_s, best_e = index, end
            index = end
        if best_e - best_s >= 12:
            y_top = float(y_centers[best_s])
            y_bot = float(y_centers[best_e])
    if pitch >= 8 and len(strong_x) >= 2:
        last_span = strong_x[-1] - strong_x[-2]
        if last_span > pitch * 1.35:
            x_right = min(float(width) * 0.995, strong_x[-1] + pitch * 1.18)
    if (x_right - x_left) < width * 0.35 or (y_bot - y_top) < height * 0.18:
        return None
    return {
        "tl": (float(x_left), float(y_top)),
        "tr": (float(x_right), float(y_top)),
        "br": (float(x_right), float(y_bot)),
        "bl": (float(x_left), float(y_bot)),
    }


def _scale_corners(
    corners: dict[str, tuple[float, float]], scale: float
) -> dict[str, tuple[float, float]]:
    return {key: (point[0] / scale, point[1] / scale) for key, point in corners.items()}


def _align_scan(
    gray: np.ndarray,
    working_binary: np.ndarray,
    scale: float,
    template: dict[str, Any],
    working_gray: np.ndarray | None = None,
) -> tuple[np.ndarray, dict[str, tuple[float, float]], str]:
    """Warp the 15 기표 rows onto the template cells. Circles are not searched."""
    width = int(template["image_width"])
    height = int(template["image_height"])
    attempts: list[tuple[str, dict[str, tuple[float, float]]]] = []

    y_limit = _banner_top(working_gray) if working_gray is not None else None
    from_lines = _find_table_corners_from_lines(working_binary, y_limit)
    if from_lines is not None:
        attempts.append(("table_lines", _scale_corners(from_lines, scale)))
    from_quad = _find_table_quad(working_binary)
    if from_quad is not None:
        attempts.append(("table_contour", _scale_corners(from_quad, scale)))

    for name, assigned in attempts:
        try:
            dest_mode = "data_rows" if name.startswith("table_") else "center"
            return _warp(gray, assigned, template, dest_mode), assigned, name
        except OmrError:
            continue

    # PDF overlay / already-aligned sheet: do not snap to random dark squares.
    if gray.shape[0] == height and gray.shape[1] == width:
        assigned = {
            "tl": (0.0, 0.0),
            "tr": (float(width), 0.0),
            "br": (float(width), float(height)),
            "bl": (0.0, float(height)),
        }
        return gray, assigned, "identity"

    try:
        candidates = _collect_candidates(working_binary, "square")
        assigned_small = _assign_markers(
            candidates, template["markers"], working_binary.shape[1], working_binary.shape[0]
        )
        assigned = _scale_corners(assigned_small, scale)
        return _warp(gray, assigned, template), assigned, "markers"
    except OmrError:
        pass

    warped = cv2.resize(gray, (width, height), interpolation=cv2.INTER_AREA)
    assigned = {
        "tl": (0.0, 0.0),
        "tr": (float(width), 0.0),
        "br": (float(width), float(height)),
        "bl": (0.0, float(height)),
    }
    return warped, assigned, "resize"


def _lock_gipyo_cells(
    template: dict[str, Any], gray: np.ndarray
) -> tuple[dict[str, Any], str]:
    """Snap the 15 row Ys to this image's 기표 grid. Circle X stays on the template."""
    options = [
        option
        for question in template.get("questions") or []
        for option in question.get("options") or []
    ]
    if len(options) != MARK_ROWS:
        return template, "template"
    height, width = gray.shape[:2]
    y_end = _banner_top(gray)
    cell_x = int(_as_float(options[0]["x"]) * width)
    x0 = max(0, min(width - 8, cell_x - 8))
    strip = gray[:y_end, x0:]
    if strip.size == 0:
        return template, "template"
    binary = _binarize(strip)
    horiz = cv2.morphologyEx(
        binary,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (max(6, strip.shape[1] // 4), 1)),
    )
    ys = [
        y
        for y in _line_centers(np.sum(horiz > 0, axis=1).astype(np.float64), 0.28, y_end)
        if y >= height * 0.12
    ]
    lines = _row_line_span(ys, MARK_ROWS + 1, float(y_end - 8))
    if lines is None:
        return template, "template"

    rows: list[tuple[float, float]] = []
    for index in range(MARK_ROWS):
        y_top = lines[index] / height
        y_h = max(8.0, lines[index + 1] - lines[index]) / height
        rows.append((y_top, y_h))

    index = 0
    questions = []
    for question in template["questions"]:
        next_options = []
        for option in question.get("options") or []:
            y_top, y_h = rows[index]
            circle = option.get("circle") if isinstance(option.get("circle"), dict) else {}
            next_options.append(
                {
                    **option,
                    "y": y_top,
                    "h": y_h,
                    "circle": {
                        "x": _as_float(circle.get("x"), option["x"] + option["w"] * CIRCLE_IN_CELL_X),
                        "w": _as_float(circle.get("w"), option["w"] * CIRCLE_IN_CELL_W),
                        "y": y_top + y_h * CIRCLE_IN_CELL_Y,
                        "h": y_h * CIRCLE_IN_CELL_H,
                    },
                }
            )
            index += 1
        questions.append({**question, "options": next_options})
    return {**template, "questions": questions}, "gipyo_rows"


def _clip_box(
    x: float, y: float, w: float, h: float, width: int, height: int
) -> tuple[int, int, int, int]:
    x0 = max(0, int(round(x)))
    y0 = max(0, int(round(y)))
    x1 = min(width, int(round(x + w)))
    y1 = min(height, int(round(y + h)))
    if x1 - x0 < 2 or y1 - y0 < 2:
        raise OmrError(400, "ROI_OUT_OF_BOUNDS")
    return x0, y0, x1, y1


def _rel_box(rect: dict[str, Any], width: int, height: int) -> tuple[int, int, int, int]:
    return _clip_box(
        _as_float(rect["x"]) * width,
        _as_float(rect["y"]) * height,
        _as_float(rect["w"]) * width,
        _as_float(rect["h"]) * height,
        width,
        height,
    )


def _cell_box(option: dict[str, Any], width: int, height: int) -> tuple[int, int, int, int]:
    return _rel_box(option, width, height)


def _circle_box(option: dict[str, Any], width: int, height: int) -> tuple[int, int, int, int]:
    """Use stored circle coords. If missing, place the circle on the right of the cell."""
    circle = option.get("circle")
    if isinstance(circle, dict) and all(key in circle for key in ("x", "y", "w", "h")):
        return _rel_box(circle, width, height)
    x0, y0, x1, y1 = _cell_box(option, width, height)
    cw = float(x1 - x0)
    ch = float(y1 - y0)
    return _clip_box(
        x0 + cw * CIRCLE_IN_CELL_X,
        y0 + ch * CIRCLE_IN_CELL_Y,
        cw * CIRCLE_IN_CELL_W,
        ch * CIRCLE_IN_CELL_H,
        width,
        height,
    )


def _soft_disk(height: int, width: int, cx: float, cy: float, rx: float, ry: float) -> np.ndarray:
    """Anti-aliased ellipse coverage in 0..1, so the rim counts as a fraction of a pixel."""
    yy, xx = np.ogrid[:height, :width]
    rx = max(1.0, rx)
    ry = max(1.0, ry)
    dist = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
    aa = 0.5 / min(rx, ry)
    return np.clip((1.0 + aa - dist) / max(2.0 * aa, 1e-6), 0.0, 1.0).astype(np.float64)


def _circle_blackness(crop: np.ndarray, coverage: np.ndarray) -> tuple[float, float]:
    """Share of the disk that is black, using continuous gray (not binary pixels)."""
    weight = float(np.sum(coverage))
    if weight <= 0:
        return 0.0, 245.0
    paper = float(np.percentile(crop.astype(np.float64), 90))
    gray = crop.astype(np.float64)
    blackness = np.clip((paper - gray) / max(1.0, paper - 40.0), 0.0, 1.0)
    fill = float(np.sum(blackness * coverage) / weight)
    return fill, paper


def _score_region(
    gray: np.ndarray,
    x0: int,
    y0: int,
    x1: int,
    y1: int,
    hole_scale: float | None = None,
) -> tuple[float, int]:
    pad = max(2, int(round(min(x1 - x0, y1 - y0) * 0.20)))
    cx0 = max(0, x0 - pad)
    cy0 = max(0, y0 - pad)
    cx1 = min(gray.shape[1], x1 + pad)
    cy1 = min(gray.shape[0], y1 + pad)
    crop = gray[cy0:cy1, cx0:cx1]
    if crop.size == 0:
        raise OmrError(400, "ROI_OUT_OF_BOUNDS")

    scale = SUBPIXEL_SCALE
    hires = cv2.resize(
        crop,
        (crop.shape[1] * scale, crop.shape[0] * scale),
        interpolation=cv2.INTER_CUBIC,
    )
    hh, ww = hires.shape[:2]
    region_cx = (((x0 + x1) / 2.0) - cx0) * scale
    region_cy = (((y0 + y1) / 2.0) - cy0) * scale
    rx = max(1.0, (x1 - x0) / 2.0) * scale
    ry = max(1.0, (y1 - y0) / 2.0) * scale
    if hole_scale is not None:
        rx *= hole_scale
        ry *= hole_scale
        coverage = _soft_disk(hh, ww, region_cx, region_cy, rx, ry)
    else:
        coverage = np.ones((hh, ww), dtype=np.float64)
        inset_y = max(1, int(hh * 0.12))
        inset_x = max(1, int(ww * 0.12))
        coverage[:inset_y, :] = 0
        coverage[-inset_y:, :] = 0
        coverage[:, :inset_x] = 0
        coverage[:, -inset_x:] = 0
    fill, paper = _circle_blackness(hires, coverage)
    if paper < BANNER_PAPER:
        fill = 0.0
    area = max(1.0, float(np.sum(coverage)) / (scale * scale))
    return fill, int(round(fill * area))


def _score_mark(gray: np.ndarray, option: dict[str, Any]) -> dict[str, Any]:
    """Circle hole = selected? Cell = which row. No adjacent-cell spill test."""
    height, width = gray.shape[:2]
    ox0, oy0, ox1, oy1 = _circle_box(option, width, height)
    gx0, gy0, gx1, gy1 = _cell_box(option, width, height)
    fill, ink_px = _score_region(gray, ox0, oy0, ox1, oy1, HOLE_SCALE)
    cell_fill, cell_px = _score_region(gray, gx0, gy0, gx1, gy1, None)
    return {
        "fill": round(fill, 4),
        "ink_px": ink_px,
        "cell_fill": round(cell_fill, 4),
        "cell_px": cell_px,
        "blob_ratio": round(fill, 4),
        "spill_ratio": 0.0,
        "scribble_blob": 0,
    }


def _fill_cut(template: dict[str, Any]) -> float:
    raw = _as_float(template.get("fill_threshold"), FILL_CUT)
    if 0.12 <= raw <= 0.90:
        return raw
    return FILL_CUT


def _is_marked(mark: dict[str, Any], cut: float) -> bool:
    return float(mark["fill"]) >= cut


def _question_mode(question: dict[str, Any]) -> str:
    qtype = str(question.get("type") or "")
    if qtype in ("single", "multi"):
        return qtype
    if question.get("max_select") is not None:
        return "multi"
    return "single"


def _select_limits(question: dict[str, Any], option_count: int) -> tuple[int, int]:
    min_select = int(_as_float(question.get("min_select"), 0))
    if question.get("max_select") is not None:
        max_select = int(_as_float(question.get("max_select"), option_count))
    elif _question_mode(question) == "single":
        max_select = 1
    else:
        max_select = option_count
    return max(0, min_select), max(0, max_select)


def process_scan(image_base64: Any, template: Any) -> dict[str, Any]:
    template = _validate_template(template)
    image = _decode_image(image_base64)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    working, scale = _downscale(gray)
    binary = _binarize(working)
    warped, assigned, alignment = _align_scan(gray, binary, scale, template, working)
    template, cell_source = _lock_gipyo_cells(template, warped)

    measured: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for question in template["questions"]:
        for option in question.get("options") or []:
            measured.append((option, _score_mark(warped, option)))
    fills = [item[1]["fill"] for item in measured]
    threshold = _fill_cut(template)
    baseline = float(np.median(np.array(fills, dtype=np.float64))) if fills else 0.0
    delta = threshold

    marked_flags = [_is_marked(mark, threshold) for _option, mark in measured]

    answers: dict[str, Any] = {}
    question_details: list[dict[str, Any]] = []
    exception_reasons: list[dict[str, Any]] = []
    measure_index = 0

    for question in template["questions"]:
        number = str(question.get("number") if question.get("number") is not None else question.get("id"))
        qlabel = str(question.get("label") or f"문항 {number}")
        options = question.get("options") or []
        scored: list[dict[str, Any]] = []
        selected: list[str] = []

        for option in options:
            index = measure_index
            mark = measured[index][1]
            measure_index += 1
            label = str(option.get("label", ""))
            marked = marked_flags[index]
            verdict = "selected" if marked else "blank"
            item = {
                "id": option.get("id"),
                "label": label,
                "title": str(option.get("title") or label),
                "fill_ratio": mark["fill"],
                "cell_fill": mark.get("cell_fill", 0.0),
                "ink_px": mark["ink_px"],
                "blob_ratio": mark["blob_ratio"],
                "verdict": verdict,
            }
            scored.append(item)
            if verdict == "selected" and label:
                selected.append(label)

        min_select, max_select = _select_limits(question, len(options))
        status = "blank"
        if selected:
            status = "marked"
        overflow = len(selected) > max_select
        underflow = len(selected) < min_select
        if overflow or underflow:
            status = "exception"
            if overflow:
                message = f"{qlabel}: {len(selected)}개 선택 (최대 {max_select}개)"
            else:
                message = f"{qlabel}: {len(selected)}개 선택 (최소 {min_select}개)"
            exception_reasons.append(
                {
                    "number": number,
                    "label": qlabel,
                    "selected_count": len(selected),
                    "max_select": max_select,
                    "kind": "count",
                    "message": message,
                }
            )

        answers[number] = selected
        question_details.append(
            {
                "question_id": question.get("id"),
                "number": number,
                "label": qlabel,
                "status": status,
                "selected": selected,
                "min_select": min_select,
                "max_select": max_select,
                "threshold": round(threshold, 4),
                "options": scored,
            }
        )

    total_selected = sum(len(value) for value in answers.values() if isinstance(value, list))
    if total_selected == 0:
        exception_reasons.append(
            {
                "number": "",
                "label": "용지",
                "selected_count": 0,
                "max_select": 0,
                "kind": "empty",
                "message": "선택이 없습니다",
            }
        )
        for detail in question_details:
            if detail.get("status") == "blank":
                detail["status"] = "exception"

    sheet_status = "exception" if exception_reasons else "ok"
    return {
        "ok": True,
        "answers": answers,
        "details": {
            "sheet_status": sheet_status,
            "alignment": alignment,
            "cell_source": cell_source,
            "engine": ENGINE,
            "mark_threshold": round(threshold, 4),
            "mark_baseline": round(baseline, 4),
            "mark_delta": round(delta, 4),
            "exception_reasons": exception_reasons,
            "questions": question_details,
        },
        "sheet_status": sheet_status,
        "exception_reasons": exception_reasons,
        "marker_count": len(assigned),
        "alignment": alignment,
    }


class handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        return

    def _send(self, status: int, payload: dict[str, Any]) -> None:
        body = _json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        self._send(200, {"ok": True, "service": "omr", "engine": ENGINE})

    def do_POST(self) -> None:  # noqa: N802
        try:
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                length = 0

            if length > MAX_PAYLOAD:
                raise OmrError(413, "PAYLOAD_TOO_LARGE")
            if length <= 0:
                raise OmrError(400, "IMAGE_DECODE_FAILED", "요청 본문이 비어 있습니다.")

            raw = self.rfile.read(length)
            if raw is None or len(raw) > MAX_PAYLOAD:
                raise OmrError(413, "PAYLOAD_TOO_LARGE")

            try:
                body = json.loads(raw.decode("utf-8"))
            except Exception as exc:
                raise OmrError(400, "IMAGE_DECODE_FAILED", "JSON 본문을 해석할 수 없습니다.") from exc

            if not isinstance(body, dict):
                raise OmrError(400, "INVALID_TEMPLATE")

            result = process_scan(body.get("image_base64"), body.get("template") or {})
            self._send(200, result)
        except OmrError as exc:
            self._send(
                exc.status,
                {"ok": False, "error_code": exc.code, "error": exc.message},
            )
        except Exception:
            traceback.print_exc()
            self._send(
                500,
                {
                    "ok": False,
                    "error_code": "INTERNAL",
                    "error": ERROR_MESSAGES["INTERNAL"],
                },
            )
