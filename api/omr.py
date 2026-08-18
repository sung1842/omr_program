"""Vercel Python serverless OMR endpoint.

Dependencies are limited to opencv-python-headless and numpy so the
uncompressed function stays within the Hobby 50MB envelope.
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
FILL_INSET_RATIO = 0.15

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


def _ordered_points(
    assigned: dict[str, tuple[float, float]],
    markers: list[dict[str, Any]],
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
        dst.append(
            (
                _as_float(marker["x"]) + _as_float(marker["w"]) / 2.0,
                _as_float(marker["y"]) + _as_float(marker["h"]) / 2.0,
            )
        )
    return np.array(src, dtype=np.float32), np.array(dst, dtype=np.float32)


def _warp(
    gray: np.ndarray,
    assigned: dict[str, tuple[float, float]],
    template: dict[str, Any],
) -> np.ndarray:
    width = int(template["image_width"])
    height = int(template["image_height"])
    src, dst_rel = _ordered_points(assigned, template["markers"])
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
            # Table sits above the personal-info block, not the full page edge.
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


def _find_table_corners_from_lines(
    binary: np.ndarray,
) -> dict[str, tuple[float, float]] | None:
    """Outer corners of the printed table, not page edges and not filled fiducials."""
    height, width = binary.shape[:2]
    y_limit = max(8, int(height * 0.84))
    roi = binary[:y_limit, :]
    horiz = cv2.morphologyEx(
        roi,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (max(15, width // 22), 1)),
    )
    vert = cv2.morphologyEx(
        roi,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(15, height // 28))),
    )
    row_score = np.sum(horiz > 0, axis=1).astype(np.float64)
    col_score = np.sum(vert > 0, axis=0).astype(np.float64)
    if row_score.max() < width * 0.18 or col_score.max() < y_limit * 0.12:
        return None
    y_clusters = _drop_border_clusters(
        _cluster_positions(np.where(row_score >= row_score.max() * 0.42)[0]),
        y_limit,
    )
    x_clusters = _drop_border_clusters(
        _cluster_positions(np.where(col_score >= col_score.max() * 0.42)[0]),
        width,
    )
    if len(y_clusters) < 2 or len(x_clusters) < 2:
        return None
    y_top = (y_clusters[0][0] + y_clusters[0][1]) / 2.0
    y_bot = (y_clusters[-1][0] + y_clusters[-1][1]) / 2.0
    x_left = (x_clusters[0][0] + x_clusters[0][1]) / 2.0
    x_right = (x_clusters[-1][0] + x_clusters[-1][1]) / 2.0
    if (x_right - x_left) < width * 0.35 or (y_bot - y_top) < height * 0.22:
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
) -> tuple[np.ndarray, dict[str, tuple[float, float]], str]:
    """Align using table outer corners first. Printed black fiducials are not on this form."""
    width = int(template["image_width"])
    height = int(template["image_height"])
    attempts: list[tuple[str, dict[str, tuple[float, float]]]] = []

    from_lines = _find_table_corners_from_lines(working_binary)
    if from_lines is not None:
        attempts.append(("table_lines", _scale_corners(from_lines, scale)))
    from_quad = _find_table_quad(working_binary)
    if from_quad is not None:
        attempts.append(("table_contour", _scale_corners(from_quad, scale)))

    for name, assigned in attempts:
        try:
            return _warp(gray, assigned, template), assigned, name
        except OmrError:
            continue

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


def _best_even_sequence(
    points: list[tuple[float, float, float]], expected: int
) -> list[tuple[float, float, float]]:
    if len(points) <= expected:
        return points
    best = points[:expected]
    best_var = float("inf")
    for start in range(0, len(points) - expected + 1):
        chunk = points[start : start + expected]
        gaps = np.diff([item[1] for item in chunk])
        variance = float(np.var(gaps)) if len(gaps) else 0.0
        if variance < best_var:
            best_var = variance
            best = chunk
    return best


def _hough_candidates(
    blur: np.ndarray, min_dist: float, min_r: int, max_r: int
) -> list[np.ndarray]:
    hits: list[np.ndarray] = []
    alt = getattr(cv2, "HOUGH_GRADIENT_ALT", None)
    if alt is not None:
        for param2 in (0.55, 0.7):
            try:
                found = cv2.HoughCircles(
                    blur,
                    alt,
                    dp=1.5,
                    minDist=min_dist,
                    param1=180,
                    param2=param2,
                    minRadius=min_r,
                    maxRadius=max_r,
                )
            except Exception:
                found = None
            if found is not None and len(found[0]) > 0:
                hits.append(found[0])
    for param2 in (11, 16, 22):
        found = cv2.HoughCircles(
            blur,
            cv2.HOUGH_GRADIENT,
            dp=1.2,
            minDist=min_dist,
            param1=60,
            param2=param2,
            minRadius=min_r,
            maxRadius=max_r,
        )
        if found is not None and len(found[0]) > 0:
            hits.append(found[0])
    return hits


def _circles_to_column(
    circles: np.ndarray,
    offset_x: int,
    offset_y: int,
    width: int,
    height: int,
    expected: int,
) -> list[tuple[float, float, float]] | None:
    points = [
        (float(circle[0]) + offset_x, float(circle[1]) + offset_y, float(circle[2]))
        for circle in circles
    ]
    if len(points) < expected:
        return None
    median_x = float(np.median([point[0] for point in points]))
    aligned = [point for point in points if abs(point[0] - median_x) < width * 0.06]
    aligned.sort(key=lambda point: point[1])
    if len(aligned) < expected:
        return None
    aligned = _best_even_sequence(aligned, expected)
    if len(aligned) != expected:
        return None
    yspan = aligned[-1][1] - aligned[0][1]
    if yspan < height * 0.26 or yspan > height * 0.78:
        return None
    radii = [point[2] for point in aligned]
    if max(radii) > min(radii) * 1.85:
        return None
    return aligned


def _find_hough_bubbles(gray: np.ndarray, expected: int = 15) -> list[dict[str, Any]] | None:
    """Find the vertical column of printed 기표 circles on the right side."""
    height, width = gray.shape[:2]
    min_r = max(6, int(height * 0.0052))
    max_r = max(min_r + 3, int(height * 0.018))
    min_dist = float(max(min_r * 2, int(height * 0.015)))
    windows = (
        (0.70, 0.998, 0.08, 0.82),
        (0.76, 0.998, 0.10, 0.80),
        (0.82, 0.999, 0.11, 0.78),
    )
    best: list[tuple[float, float, float]] | None = None
    best_score = -1.0
    for x0r, x1r, y0r, y1r in windows:
        x0 = int(width * x0r)
        x1 = max(x0 + 8, int(width * x1r))
        y0 = int(height * y0r)
        y1 = max(y0 + 8, int(height * y1r))
        strip = gray[y0:y1, x0:x1]
        if strip.size == 0:
            continue
        variants = [cv2.GaussianBlur(strip, (5, 5), 0)]
        try:
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            variants.append(cv2.GaussianBlur(clahe.apply(strip), (5, 5), 0))
        except Exception:
            pass
        for blur in variants:
            for circles in _hough_candidates(blur, min_dist, min_r, max_r):
                aligned = _circles_to_column(circles, x0, y0, width, height, expected)
                if not aligned:
                    continue
                xs = np.array([point[0] for point in aligned], dtype=np.float64)
                gaps = np.diff([point[1] for point in aligned])
                compactness = 1.0 / (1.0 + float(np.std(xs)) + float(np.std(gaps)))
                if compactness > best_score:
                    best_score = compactness
                    best = aligned
        if best is not None:
            break
    if best is None:
        return None

    cells: list[dict[str, Any]] = []
    for cx, cy, radius in best:
        radius = max(4.0, radius)
        cell = radius * 2.55
        cells.append(
            {
                "x": (cx - cell / 2.0) / width,
                "y": (cy - cell / 2.0) / height,
                "w": cell / width,
                "h": cell / height,
                "circle": {
                    "x": (cx - radius) / width,
                    "y": (cy - radius) / height,
                    "w": (radius * 2.0) / width,
                    "h": (radius * 2.0) / height,
                },
            }
        )
    return cells


def _detect_mark_cells(warped: np.ndarray, expected: int = 15) -> list[dict[str, float]] | None:
    """Find the rightmost 기표란 cells from table ruling lines. No hand-drawn ROI needed."""
    binary = _binarize(warped)
    height, width = binary.shape[:2]
    y_limit = max(8, int(height * 0.80))
    roi = binary[:y_limit, :]
    horiz = cv2.morphologyEx(
        roi,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (max(15, width // 22), 1)),
    )
    vert = cv2.morphologyEx(
        roi,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(15, height // 28))),
    )
    row_score = np.sum(horiz > 0, axis=1).astype(np.float64)
    col_score = np.sum(vert > 0, axis=0).astype(np.float64)
    if row_score.max() < width * 0.18 or col_score.max() < y_limit * 0.12:
        return None
    y_clusters = _drop_border_clusters(
        _cluster_positions(np.where(row_score >= row_score.max() * 0.42)[0]),
        y_limit,
    )
    x_clusters = _drop_border_clusters(
        _cluster_positions(np.where(col_score >= col_score.max() * 0.42)[0]),
        width,
    )
    if len(y_clusters) < expected + 1 or len(x_clusters) < 2:
        return None

    line_ys = [(pair[0] + pair[1]) / 2.0 for pair in y_clusters]
    line_xs = [(pair[0] + pair[1]) / 2.0 for pair in x_clusters]
    bands = list(zip(line_ys[:-1], line_ys[1:]))
    if len(bands) >= expected + 2:
        bands = bands[2 : 2 + expected]
    elif len(bands) >= expected + 1:
        bands = bands[1 : 1 + expected]
    elif len(bands) >= expected:
        bands = bands[:expected]
    else:
        return None
    if len(bands) != expected:
        return None

    x0, x1 = line_xs[-2], line_xs[-1]
    if x1 - x0 < width * 0.028 or x1 - x0 > width * 0.13:
        return None

    cells: list[dict[str, float]] = []
    for y0, y1 in bands:
        pad_x = (x1 - x0) * 0.10
        pad_y = (y1 - y0) * 0.10
        rx0 = x0 + pad_x
        ry0 = y0 + pad_y
        rw = max(4.0, x1 - x0 - pad_x * 2)
        rh = max(4.0, y1 - y0 - pad_y * 2)
        cells.append(
            {
                "x": rx0 / width,
                "y": ry0 / height,
                "w": rw / width,
                "h": rh / height,
            }
        )
    return cells


def _overlay_cells(template: dict[str, Any], cells: list[dict[str, Any]]) -> dict[str, Any] | None:
    questions = []
    index = 0
    expected = sum(len(question.get("options") or []) for question in template.get("questions") or [])
    for question in template["questions"]:
        options = []
        for option in question.get("options") or []:
            if index >= len(cells):
                break
            options.append({**option, **cells[index]})
            index += 1
        questions.append({**question, "options": options})
    if index != expected:
        return None
    return {**template, "questions": questions}


def _apply_detected_cells(
    template: dict[str, Any], warped: np.ndarray, original: np.ndarray
) -> tuple[dict[str, Any], str, str]:
    if template.get("auto_mark_cells") is False:
        return template, "template", "warped"
    expected = sum(len(question.get("options") or []) for question in template.get("questions") or [])
    if expected <= 0:
        return template, "template", "warped"

    searches = (
        (warped, "hough", "warped"),
        (original, "hough_original", "original"),
    )
    for image, source, score_on in searches:
        cells = _find_hough_bubbles(image, expected)
        if not cells:
            continue
        overlaid = _overlay_cells(template, cells)
        if overlaid is not None:
            return overlaid, source, score_on

    cells = _detect_mark_cells(warped, expected)
    if cells:
        overlaid = _overlay_cells(template, cells)
        if overlaid is not None:
            return overlaid, "grid", "warped"
    return template, "template", "warped"

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
    circle = option.get("circle")
    if isinstance(circle, dict) and all(key in circle for key in ("x", "y", "w", "h")):
        return _rel_box(circle, width, height)
    x0, y0, x1, y1 = _cell_box(option, width, height)
    side = min(x1 - x0, y1 - y0) * 0.64
    cx = (x0 + x1) / 2.0
    cy = (y0 + y1) / 2.0
    return _clip_box(cx - side / 2.0, cy - side / 2.0, side, side, width, height)


def _ellipse_mask(shape: tuple[int, int], cx: float, cy: float, rx: float, ry: float, scale: float = 1.0):
    height, width = shape
    yy, xx = np.ogrid[:height, :width]
    rx = max(1.0, rx * scale)
    ry = max(1.0, ry * scale)
    return ((xx - cx) ** 2) / (rx * rx) + ((yy - cy) ** 2) / (ry * ry) <= 1.0


def _ink_ratio(binary: np.ndarray, mask: np.ndarray) -> float:
    pixels = int(np.count_nonzero(mask))
    if pixels == 0:
        return 0.0
    return float(np.mean(binary[mask]) / 255.0)


def _ink_pixels(binary: np.ndarray, mask: np.ndarray) -> int:
    if binary.size == 0 or int(np.count_nonzero(mask)) == 0:
        return 0
    return int(np.count_nonzero(binary[mask] > 0))


def _rect_mask(hh: int, ww: int, y0: int, x0: int, y1: int, x1: int) -> np.ndarray:
    mask = np.zeros((hh, ww), dtype=bool)
    ya = max(0, min(hh, y0))
    yb = max(0, min(hh, y1))
    xa = max(0, min(ww, x0))
    xb = max(0, min(ww, x1))
    if yb > ya and xb > xa:
        mask[ya:yb, xa:xb] = True
    return mask


def _paper_ink(crop: np.ndarray, paper_mask: np.ndarray) -> np.ndarray:
    """Ink = darker than local paper. Do not use Otsu (it treats the printed ○ as fill)."""
    if int(np.count_nonzero(paper_mask)) >= 16:
        paper = float(np.percentile(crop[paper_mask].astype(np.float64), 75))
    else:
        paper = float(np.percentile(crop.astype(np.float64), 88))
    cutoff = paper - 18.0
    return np.where(crop < cutoff, 255, 0).astype(np.uint8)


def _without_grid(ink: np.ndarray) -> np.ndarray:
    hh, ww = ink.shape[:2]
    # Only strip row-separator lines. Vertical strokes are real marks or neighbor spill.
    horiz = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((1, max(15, int(ww * 0.72))), np.uint8))
    return cv2.subtract(ink, horiz)


def _grow_from_hole(ink: np.ndarray, hole: np.ndarray) -> np.ndarray:
    """Follow a stroke out of the hole, including past the printed outline into the cell."""
    seed = ink.copy()
    seed[~hole] = 0
    space = _without_grid(ink)
    grown = seed
    kernel = np.ones((3, 3), np.uint8)
    for _ in range(32):
        nxt = cv2.bitwise_and(cv2.dilate(grown, kernel), cv2.bitwise_or(space, seed))
        if np.array_equal(nxt, grown):
            break
        grown = nxt
    return grown


def _score_mark(gray: np.ndarray, option: dict[str, Any]) -> dict[str, Any]:
    """Score the white hole inside the printed circle. The black ring is ignored."""
    height, width = gray.shape[:2]
    cx0, cy0, cx1, cy1 = _cell_box(option, width, height)
    ox0, oy0, ox1, oy1 = _circle_box(option, width, height)
    pad = max(3, int(round((cy1 - cy0) * 0.08)))
    x0 = max(0, cx0 - pad)
    y0 = max(0, cy0 - pad)
    x1 = min(width, cx1 + pad)
    y1 = min(height, cy1 + pad)
    crop = gray[y0:y1, x0:x1]
    if crop.size == 0:
        raise OmrError(400, "ROI_OUT_OF_BOUNDS")

    hh, ww = crop.shape[:2]
    inset = max(1, int(round(min(cy1 - cy0, cx1 - cx0) * FILL_INSET_RATIO)))
    cell = _rect_mask(hh, ww, cy0 - y0 + inset, cx0 - x0 + inset, cy1 - y0 - inset, cx1 - x0 - inset)
    cell_full = _rect_mask(hh, ww, cy0 - y0, cx0 - x0, cy1 - y0, cx1 - x0)
    halo = ~cell_full

    circle_cx = ((ox0 + ox1) / 2.0) - x0
    circle_cy = ((oy0 + oy1) / 2.0) - y0
    rx = max(1.0, (ox1 - ox0) / 2.0)
    ry = max(1.0, (oy1 - oy0) / 2.0)
    # 55–70% of the printed circle: the white hole, not the black outline.
    hole = _ellipse_mask((hh, ww), circle_cx, circle_cy, rx, ry, 0.62)
    printed = _ellipse_mask((hh, ww), circle_cx, circle_cy, rx, ry, 1.08)
    paper_region = cell & ~printed

    ink = _paper_ink(crop, paper_region)
    mark_ink = _without_grid(ink)
    hole_fill = _ink_ratio(mark_ink, hole)
    hole_px = _ink_pixels(mark_ink, hole)
    cell_scribble = _ink_ratio(mark_ink, paper_region)
    grown = _grow_from_hole(mark_ink, hole)
    spill = _ink_ratio(grown, halo)
    spill_px = _ink_pixels(grown, halo)
    return {
        "circle_fill": round(hole_fill, 4),
        "hole_fill": round(hole_fill, 4),
        "hole_ink_px": hole_px,
        "cell_fill": round(cell_scribble, 4),
        "spill_fill": round(spill, 4),
        "spill_out": spill >= 0.08 or spill_px >= 18,
        "cell_scribble": cell_scribble >= 0.07 or _ink_pixels(mark_ink, paper_region) >= 40,
    }


def _fill_ratio(warped: np.ndarray, option: dict[str, Any]) -> float:
    return float(_score_mark(warped, option)["circle_fill"])


def _empty_hole_baseline(fills: list[float]) -> float:
    if not fills:
        return 0.0
    values = np.array(fills, dtype=np.float64)
    median = float(np.median(values))
    low = float(np.percentile(values, 30))
    # Most bubbles on a sheet are empty; if many are marked, median is no longer empty.
    return min(median, low)


def _hole_delta(raw: float) -> float:
    """Legacy templates stored 0.08 as an absolute fill floor. Hole scoring uses a small delta."""
    if raw <= 0.0:
        return 0.012
    if raw <= 0.04:
        return raw
    return 0.012


def _is_marked(mark: dict[str, Any], baseline: float, delta: float) -> bool:
    hole_fill = float(mark["hole_fill"])
    hole_px = int(mark["hole_ink_px"])
    return hole_fill >= baseline + delta or (hole_px >= 28 and hole_fill > baseline + 0.004)


def process_scan(image_base64: Any, template: Any) -> dict[str, Any]:
    template = _validate_template(template)
    image = _decode_image(image_base64)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    working, scale = _downscale(gray)
    binary = _binarize(working)
    warped, assigned, alignment = _align_scan(gray, binary, scale, template)
    template, cell_source, score_on = _apply_detected_cells(template, warped, working)
    score_img = working if score_on == "original" else warped

    delta = _hole_delta(_as_float(template.get("fill_threshold"), 0.012))
    measured: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for question in template["questions"]:
        for option in question.get("options") or []:
            measured.append((option, _score_mark(score_img, option)))
    baseline = _empty_hole_baseline([item[1]["hole_fill"] for item in measured])
    threshold = baseline + delta

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
        geometry = False

        for option in options:
            mark = measured[measure_index][1]
            measure_index += 1
            label = str(option.get("label", ""))
            marked = _is_marked(mark, baseline, delta)
            if marked and mark["spill_out"]:
                verdict = "exception"
                geometry = True
                exception_reasons.append(
                    {
                        "number": number,
                        "label": qlabel,
                        "selected_count": 0,
                        "max_select": 0,
                        "kind": "geometry",
                        "option_label": label,
                        "message": f"{qlabel} {label}: 칸 밖으로 넘침",
                    }
                )
            elif not marked and mark["cell_scribble"]:
                verdict = "exception"
                geometry = True
                exception_reasons.append(
                    {
                        "number": number,
                        "label": qlabel,
                        "selected_count": 0,
                        "max_select": 0,
                        "kind": "geometry",
                        "option_label": label,
                        "message": f"{qlabel} {label}: 원은 비었고 칸에만 낙서",
                    }
                )
            elif marked:
                verdict = "selected"
            else:
                verdict = "blank"
            item = {
                "id": option.get("id"),
                "label": label,
                "title": str(option.get("title") or label),
                "fill_ratio": mark["hole_fill"],
                "hole_fill": mark["hole_fill"],
                "hole_ink_px": mark["hole_ink_px"],
                "cell_fill": mark["cell_fill"],
                "spill_fill": mark["spill_fill"],
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
        elif geometry:
            status = "exception"

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

    sheet_status = "exception" if exception_reasons else "ok"
    return {
        "ok": True,
        "answers": answers,
        "details": {
            "sheet_status": sheet_status,
            "alignment": alignment,
            "cell_source": cell_source,
            "score_on": score_on,
            "mark_threshold": round(threshold, 4),
            "hole_baseline": round(baseline, 4),
            "hole_delta": round(delta, 4),
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
        self._send(200, {"ok": True, "service": "omr"})

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
