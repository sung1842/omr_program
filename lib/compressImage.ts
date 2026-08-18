import { TARGET_IMAGE_BYTES, VERCEL_PAYLOAD_LIMIT } from "@/lib/types";

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽을 수 없습니다."));
    };
    image.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("JPEG 인코딩에 실패했습니다."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

export async function compressForOmr(file: File): Promise<{ blob: Blob; tooLarge: boolean }> {
  const image = await loadImage(file);
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  let width = Math.max(1, Math.round(image.width * scale));
  let height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas를 초기화할 수 없습니다.");
  }

  let quality = 0.82;
  let blob: Blob | null = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    blob = await canvasToJpeg(canvas, quality);
    if (blob.size <= TARGET_IMAGE_BYTES) {
      break;
    }
    if (quality > 0.45) {
      quality -= 0.12;
    } else {
      width = Math.max(640, Math.round(width * 0.82));
      height = Math.max(640, Math.round(height * 0.82));
      quality = 0.7;
    }
  }

  if (!blob) {
    throw new Error("이미지 압축에 실패했습니다.");
  }

  return { blob, tooLarge: blob.size > VERCEL_PAYLOAD_LIMIT };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Base64 변환 실패"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Base64 변환 실패"));
    reader.readAsDataURL(blob);
  });
}
