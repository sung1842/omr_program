import { blobToBase64, compressForOmr } from "@/lib/compressImage";
import {
  MAX_RETRIES,
  OMR_TIMEOUT_MS,
  VERCEL_PAYLOAD_LIMIT,
  type OmrFailure,
  type OmrSuccess,
  type TemplatePayload,
} from "@/lib/types";

export class OmrRequestError extends Error {
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

export async function recognizeSheet(
  file: File,
  template: TemplatePayload,
): Promise<OmrSuccess> {
  const { blob, tooLarge } = await compressForOmr(file);
  if (tooLarge) {
    throw new OmrRequestError(413, "PAYLOAD_TOO_LARGE", "용량 초과 (4.5MB 제한)");
  }

  const imageBase64 = await blobToBase64(blob);
  const body = JSON.stringify({
    image_base64: imageBase64,
    template: {
      image_width: template.image_width,
      image_height: template.image_height,
      marker_shape: template.marker_shape,
      markers: template.markers,
      questions: template.questions,
      fill_threshold: template.fill_threshold,
      auto_mark_cells: false,
    },
  });

  if (body.length > VERCEL_PAYLOAD_LIMIT) {
    throw new OmrRequestError(413, "PAYLOAD_TOO_LARGE", "용량 초과 (4.5MB 제한)");
  }

  let lastError: OmrRequestError | null = null;

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

      const json = (await response.json().catch(() => null)) as
        | OmrSuccess
        | OmrFailure
        | null;

      if (response.status === 413) {
        throw new OmrRequestError(413, "PAYLOAD_TOO_LARGE", "용량 초과 (4.5MB 제한)");
      }

      if (response.status === 400) {
        const message =
          json && "error" in json ? json.error : "요청을 처리할 수 없습니다.";
        const code =
          json && "error_code" in json ? json.error_code : "BAD_REQUEST";
        throw new OmrRequestError(400, code, message);
      }

      if (!response.ok) {
        throw new OmrRequestError(
          response.status,
          response.status === 504 ? "TIMEOUT" : "HTTP_ERROR",
          response.status === 504
            ? "서버 처리 시간 초과 (10초)"
            : `서버 오류 (${response.status})`,
        );
      }

      if (!json || !("ok" in json) || json.ok !== true) {
        const failure = json as OmrFailure | null;
        throw new OmrRequestError(
          400,
          failure?.error_code ?? "BAD_REQUEST",
          failure?.error ?? "인식 결과를 해석할 수 없습니다.",
        );
      }

      return {
        ...json,
        sheet_status: json.sheet_status ?? "ok",
        exception_reasons: json.exception_reasons ?? [],
      };
    } catch (error) {
      if (error instanceof OmrRequestError) {
        if (!isRetryable(error.status) || attempt === MAX_RETRIES) {
          throw error;
        }
        lastError = error;
      } else if (error instanceof DOMException && error.name === "AbortError") {
        lastError = new OmrRequestError(504, "TIMEOUT", "서버 처리 시간 초과 (10초)");
        if (attempt === MAX_RETRIES) {
          throw lastError;
        }
      } else if (error instanceof TypeError) {
        lastError = new OmrRequestError(
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

  throw lastError ?? new OmrRequestError(500, "INTERNAL", "알 수 없는 오류");
}
