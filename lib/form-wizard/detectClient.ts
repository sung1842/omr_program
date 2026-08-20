import { blobToBase64, compressForOmr } from "@/lib/compressImage";
import { MAX_RETRIES, OMR_TIMEOUT_MS, VERCEL_PAYLOAD_LIMIT } from "@/lib/types";
import type { DetectCirclesResult, DetectedCircle, DetectRegion } from "@/lib/form-wizard/types";

export class DetectRequestError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryable(status: number) {
  return status === 408 || status === 502 || status === 503 || status === 504 || status === 0;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function assertRegion(region: DetectRegion) {
  const x = asFiniteNumber(region?.x);
  const y = asFiniteNumber(region?.y);
  const w = asFiniteNumber(region?.w);
  const h = asFiniteNumber(region?.h);
  if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0) {
    throw new DetectRequestError(400, "INVALID_REGION", "문항 영역 좌표가 올바르지 않습니다.");
  }
}

function parseCircle(value: unknown, index: number): DetectedCircle {
  if (!value || typeof value !== "object") {
    throw new DetectRequestError(400, "BAD_RESPONSE", `원 후보 ${index + 1}를 해석할 수 없습니다.`);
  }
  const item = value as Record<string, unknown>;
  const x = asFiniteNumber(item.x);
  const y = asFiniteNumber(item.y);
  const w = asFiniteNumber(item.w);
  const h = asFiniteNumber(item.h);
  const score = asFiniteNumber(item.score);
  if (x === null || y === null || w === null || h === null || score === null) {
    throw new DetectRequestError(400, "BAD_RESPONSE", `원 후보 ${index + 1}를 해석할 수 없습니다.`);
  }
  return { x, y, w, h, score };
}

function parseDetectResult(json: unknown): DetectCirclesResult {
  if (!json || typeof json !== "object") {
    throw new DetectRequestError(400, "BAD_RESPONSE", "검출 결과를 해석할 수 없습니다.");
  }

  const body = json as Record<string, unknown>;
  if (body.ok === false) {
    const message = typeof body.error === "string" ? body.error : "요청을 처리할 수 없습니다.";
    const code = typeof body.error_code === "string" ? body.error_code : "BAD_REQUEST";
    throw new DetectRequestError(400, code, message);
  }

  if (!Array.isArray(body.circles)) {
    throw new DetectRequestError(400, "BAD_RESPONSE", "검출 결과를 해석할 수 없습니다.");
  }

  const rejected = asFiniteNumber(body.rejected_count);
  return {
    circles: body.circles.map(parseCircle),
    rejected_count: rejected === null ? 0 : Math.max(0, Math.round(rejected)),
  };
}

/** Compress a blank-form File into a data URL for repeated detect calls. */
export async function prepareDetectImage(file: File): Promise<string> {
  const { blob, tooLarge } = await compressForOmr(file);
  if (tooLarge) {
    throw new DetectRequestError(413, "PAYLOAD_TOO_LARGE", "용량 초과 (4.5MB 제한)");
  }
  return blobToBase64(blob);
}

async function toImageBase64(image: File | string): Promise<string> {
  if (typeof image === "string") {
    if (!image.trim()) {
      throw new DetectRequestError(400, "BAD_REQUEST", "이미지가 비어 있습니다.");
    }
    return image;
  }
  return prepareDetectImage(image);
}

/**
 * POST /api/omr with action=detect_circles.
 * `region` is relative 0–1. Pass a File (compressed once) or a data URL from prepareDetectImage.
 */
export async function detectCircles(
  image: File | string,
  region: DetectRegion,
): Promise<DetectCirclesResult> {
  assertRegion(region);
  const imageBase64 = await toImageBase64(image);
  const body = JSON.stringify({
    action: "detect_circles",
    image_base64: imageBase64,
    region: {
      x: region.x,
      y: region.y,
      w: region.w,
      h: region.h,
    },
  });

  if (body.length > VERCEL_PAYLOAD_LIMIT) {
    throw new DetectRequestError(413, "PAYLOAD_TOO_LARGE", "용량 초과 (4.5MB 제한)");
  }

  let lastError: DetectRequestError | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OMR_TIMEOUT_MS);

    try {
      const response = await fetch("/api/omr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });

      const json = (await response.json().catch(() => null)) as unknown;

      if (response.status === 413) {
        throw new DetectRequestError(413, "PAYLOAD_TOO_LARGE", "용량 초과 (4.5MB 제한)");
      }

      if (response.status === 400) {
        const failure =
          json && typeof json === "object"
            ? (json as { error?: string; error_code?: string })
            : null;
        throw new DetectRequestError(
          400,
          failure?.error_code ?? "BAD_REQUEST",
          failure?.error ?? "요청을 처리할 수 없습니다.",
        );
      }

      if (!response.ok) {
        throw new DetectRequestError(
          response.status,
          response.status === 504 ? "TIMEOUT" : "HTTP_ERROR",
          response.status === 504
            ? "서버 처리 시간 초과 (10초)"
            : `서버 오류 (${response.status})`,
        );
      }

      return parseDetectResult(json);
    } catch (error) {
      if (error instanceof DetectRequestError) {
        if (!isRetryable(error.status) || attempt === MAX_RETRIES) {
          throw error;
        }
        lastError = error;
      } else if (error instanceof DOMException && error.name === "AbortError") {
        lastError = new DetectRequestError(504, "TIMEOUT", "서버 처리 시간 초과 (10초)");
        if (attempt === MAX_RETRIES) {
          throw lastError;
        }
      } else if (error instanceof TypeError) {
        lastError = new DetectRequestError(
          0,
          "NETWORK",
          "네트워크 오류 또는 OMR API가 실행 중이지 않습니다.",
        );
        if (attempt === MAX_RETRIES) {
          throw lastError;
        }
      } else {
        throw error;
      }
    } finally {
      clearTimeout(timer);
    }

    await sleep(1000 * 2 ** (attempt - 1));
  }

  throw lastError ?? new DetectRequestError(500, "INTERNAL", "알 수 없는 오류");
}
