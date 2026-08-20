"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { detectCircles, prepareDetectImage } from "@/lib/form-wizard/detectClient";
import { VILLAGE_AGENDA_FORM } from "@/lib/formSpec";
import { assignCornerIds, fromRelative, toRelative } from "@/lib/geometry";
import { squareAroundCenter } from "./canvas-geometry";
import {
  FORM_FILE_ACCEPT,
  isPdfFile,
  isSupportedFormFile,
  loadFormImage,
  loadPdfPagesAsFiles,
} from "@/lib/loadFormImage";
import { takePendingTemplateFile } from "@/lib/pendingTemplateFile";
import { normalizeQuestion } from "@/lib/results";
import type { Marker, MarkerShape, OptionROI, Question, TemplatePayload } from "@/lib/types";
import { MAX_MARKERS } from "@/lib/types";
import { Save } from "lucide-react";
import { StepMarkers } from "./StepMarkers";
import { StepQuestions } from "./StepQuestions";
import { StepReview } from "./StepReview";
import { StepUpload } from "./StepUpload";
import WizardCanvas, {
  type CanvasCircle,
  type CanvasMarker,
  type CanvasTool,
  type RelRect,
  type WizardCanvasMode,
} from "./WizardCanvas";

type WizardStep = 1 | 2 | 3 | 4;

type DraftQuestion = {
  id: string;
  label: string;
  min_select: number;
  max_select: number;
  exclusive: boolean;
  region: RelRect | null;
  circles: CanvasCircle[];
};

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 1, label: "Form" },
  { id: 2, label: "Corners" },
  { id: 3, label: "Questions" },
  { id: 4, label: "Review" },
];

export type FormWizardProps = {
  onSave?: (payload: TemplatePayload) => void | Promise<void>;
};

function defaultMarkers(): CanvasMarker[] {
  const w = 0.04;
  const h = 0.03;
  return [
    { id: "tl", x: 0.02, y: 0.02, w, h },
    { id: "tr", x: 0.98 - w, y: 0.02, w, h },
    { id: "br", x: 0.98 - w, y: 0.98 - h, w, h },
    { id: "bl", x: 0.02, y: 0.98 - h, w, h },
  ];
}

function emptyQuestion(number: number): DraftQuestion {
  return {
    id: crypto.randomUUID(),
    label: `문항 ${number}`,
    min_select: 0,
    max_select: 1,
    exclusive: true,
    region: null,
    circles: [],
  };
}

function optionCells(
  region: RelRect | null,
  circles: CanvasCircle[],
  imageWidth: number,
  imageHeight: number,
): OptionROI[] {
  const squared = circles.map((circle) => {
    const px = fromRelative(circle, imageWidth, imageHeight);
    return {
      ...circle,
      ...toRelative(squareAroundCenter(px.x, px.y, px.w, px.h), imageWidth, imageHeight),
    };
  });
  const sorted = [...squared].sort(
    (a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x,
  );
  const centers = sorted.map((item) => item.y + item.h / 2);
  return sorted.map((circle, index) => {
    let cell: RelRect = { x: circle.x, y: circle.y, w: circle.w, h: circle.h };
    if (region) {
      const top = index === 0 ? region.y : (centers[index - 1] + centers[index]) / 2;
      const bottom =
        index === sorted.length - 1
          ? region.y + region.h
          : (centers[index] + centers[index + 1]) / 2;
      cell = { x: region.x, y: top, w: region.w, h: Math.max(0.002, bottom - top) };
    }
    return {
      id: circle.id,
      label: String(index + 1),
      ...cell,
      circle: { x: circle.x, y: circle.y, w: circle.w, h: circle.h },
    };
  });
}

export default function FormWizard({ onSave }: FormWizardProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<WizardStep>(1);
  const [name, setName] = useState("");
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [detectImage, setDetectImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [markerShape, setMarkerShape] = useState<MarkerShape>("square");
  const [markers, setMarkers] = useState<CanvasMarker[]>([]);
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [editCircles, setEditCircles] = useState(false);
  const [canvasTool, setCanvasTool] = useState<CanvasTool>("select");
  const [detecting, setDetecting] = useState(false);
  const [threshold, setThreshold] = useState(VILLAGE_AGENDA_FORM.fill_threshold);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const activeQuestion = questions.find((question) => question.id === activeQuestionId) ?? null;

  useEffect(() => {
    const pending = takePendingTemplateFile();
    if (pending) {
      void onFile(pending);
    }
    // Load a file handed off from the 양식 학습 drop zone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step === 3) {
      setCanvasTool(editCircles ? "circle" : "rect");
      return;
    }
    setCanvasTool("select");
    // Reset tools when the wizard step changes; keep the current 상자/원 choice on step 3.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function onFile(file: File | undefined) {
    if (!file) {
      return;
    }
    if (!isSupportedFormFile(file)) {
      setError("JPG, PNG, WEBP, PDF만 올릴 수 있습니다.");
      return;
    }
    setLoadingFile(true);
    setError(null);
    setMessage(null);
    try {
      let preview = file;
      if (isPdfFile(file)) {
        const pages = await loadPdfPagesAsFiles(file);
        preview = pages[0];
      }
      const next = await loadFormImage(preview);
      let imageBase64: string | null = null;
      try {
        imageBase64 = await prepareDetectImage(preview);
      } catch {
        imageBase64 = null;
      }
      const first = emptyQuestion(1);
      setImage(next);
      setDetectImage(imageBase64);
      setFileName(file.name);
      setMarkers(defaultMarkers());
      setQuestions([first]);
      setActiveQuestionId(first.id);
      setEditCircles(false);
      setStep(1);
    } catch (loadError) {
      setImage(null);
      setDetectImage(null);
      setFileName(null);
      setError(loadError instanceof Error ? loadError.message : "파일을 열 수 없습니다.");
    } finally {
      setLoadingFile(false);
    }
  }

  function patchQuestion(id: string, patch: Partial<DraftQuestion>) {
    setQuestions((current) =>
      current.map((question) => (question.id === id ? { ...question, ...patch } : question)),
    );
  }

  const canProceed = useMemo(() => {
    if (step === 1) {
      return Boolean(image) && name.trim().length > 0;
    }
    if (step === 2) {
      return markers.length === MAX_MARKERS;
    }
    if (step === 3) {
      return questions.length > 0 && questions.every((question) => question.region);
    }
    return false;
  }, [image, markers.length, name, questions, step]);

  const canSave =
    Boolean(image) &&
    name.trim().length > 0 &&
    markers.length === MAX_MARKERS &&
    questions.length > 0 &&
    questions.every((question) => question.region && question.circles.length > 0);

  function canvasMode(): WizardCanvasMode {
    if (step === 3) {
      return canvasTool === "circle" || editCircles ? "circles" : "region";
    }
    return "corners";
  }

  function handleToolChange(next: CanvasTool) {
    setCanvasTool(next);
    if (next === "circle") {
      setEditCircles(true);
    }
    if (next === "rect") {
      setEditCircles(false);
    }
  }

  function buildPayload(): TemplatePayload | null {
    if (!image) {
      return null;
    }
    const pixelMarkers = markers.map((marker) => ({
      id: marker.id,
      ...fromRelative(marker, image.width, image.height),
    }));
    const assigned = assignCornerIds(pixelMarkers);
    if (assigned.length !== MAX_MARKERS) {
      return null;
    }
    const payloadMarkers: Marker[] = assigned.map((marker) => ({
      id: marker.id,
      shape: markerShape,
      ...toRelative(marker, image.width, image.height),
    }));
    const payloadQuestions: Question[] = questions.map((question, index) =>
      normalizeQuestion({
        id: question.id,
        number: index + 1,
        label: question.label.trim() || `문항 ${index + 1}`,
        type: question.exclusive ? "single" : "multi",
        min_select: question.min_select,
        max_select: question.exclusive ? 1 : question.max_select,
        on_overflow: "exception",
        options: optionCells(question.region, question.circles, image.width, image.height),
      }),
    );
    return {
      name: name.trim(),
      image_width: image.width,
      image_height: image.height,
      marker_shape: markerShape,
      markers: payloadMarkers,
      questions: payloadQuestions,
      fill_threshold: threshold,
    };
  }

  async function detectActive() {
    if (!activeQuestion?.region) {
      setError("문항 상자를 먼저 그리세요.");
      return;
    }
    setDetecting(true);
    setError(null);
    setMessage(null);
    try {
      if (!detectImage) {
        throw new Error("detect image missing");
      }
      const result = await detectCircles(detectImage, activeQuestion.region);
      const nextCircles: CanvasCircle[] = result.circles
        .slice()
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((circle) => {
          if (!image) {
            return { id: crypto.randomUUID(), x: circle.x, y: circle.y, w: circle.w, h: circle.h };
          }
          const px = fromRelative(circle, image.width, image.height);
          return {
            id: crypto.randomUUID(),
            ...toRelative(squareAroundCenter(px.x, px.y, px.w, px.h), image.width, image.height),
          };
        });
      patchQuestion(activeQuestion.id, { circles: nextCircles });
      setEditCircles(false);
      if (nextCircles.length === 0) {
        setMessage("원을 찾지 못했습니다. 상자는 유지됩니다. 원 수정에서 직접 추가하세요.");
      } else {
        const rejected =
          result.rejected_count > 0 ? ` (제외 ${result.rejected_count}개)` : "";
        setMessage(`원 ${nextCircles.length}개를 찾았습니다.${rejected}`);
      }
    } catch {
      setError("원 검출을 실행하지 못했습니다. 상자는 유지됩니다. 원을 직접 추가하세요.");
    } finally {
      setDetecting(false);
    }
  }

  async function save() {
    const payload = buildPayload();
    if (!payload) {
      setError("양식 이름, 모서리 4개, 문항마다 상자와 원이 필요합니다.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await onSave?.(payload);
      setMessage(onSave ? "양식을 저장했습니다." : "저장 함수가 연결되지 않았습니다.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const reviewCircles = step === 4 ? questions.flatMap((question) => question.circles) : null;
  const canvasCircles = reviewCircles ?? activeQuestion?.circles ?? [];
  const canvasRegion = step === 3 ? (activeQuestion?.region ?? null) : null;
  const canvasMarkers = step >= 2 ? markers : [];

  return (
    <div className="wizard-shell grid h-full min-h-0 grid-rows-[minmax(10rem,min(40vh,22rem))_minmax(0,1fr)] gap-0 overflow-hidden rounded-lg border border-white/12 lg:grid-cols-[minmax(0,18.75rem)_minmax(0,1fr)] lg:grid-rows-1">
      {/* FORM_WIZARD_CHROME: restyle this shell (steps, panels, buttons) from a 21st.dev prompt. Keep WizardCanvas. */}
      <section className="wizard-panel min-h-0 space-y-4 overflow-y-auto overscroll-contain border-b border-white/10 p-4 lg:border-b-0 lg:border-r">
        <nav className="wizard-steps">
          {STEPS.map((item) => {
            const active = step === item.id;
            const reachable = item.id <= step || (item.id === step + 1 && canProceed);
            return (
              <button
                key={item.id}
                type="button"
                className={`wizard-step ${active ? "is-active" : ""}`}
                disabled={!reachable && item.id > step}
                onClick={() => {
                  if (item.id < step || (item.id === step + 1 && canProceed) || item.id === step) {
                    setStep(item.id);
                    setEditCircles(false);
                  }
                }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {step === 1 ? (
          <StepUpload
            name={name}
            onNameChange={setName}
            fileName={fileName}
            loadingFile={loadingFile}
            hasImage={Boolean(image)}
            onPickClick={() => fileInputRef.current?.click()}
            onDropFile={(file) => void onFile(file)}
          />
        ) : null}
        {step === 2 ? (
          <StepMarkers
            markers={markers}
            markerShape={markerShape}
            onMarkerShapeChange={setMarkerShape}
            onReset={() => setMarkers(defaultMarkers())}
            imageWidth={image?.width ?? null}
            imageHeight={image?.height ?? null}
          />
        ) : null}
        {step === 3 ? (
          <StepQuestions
            questions={questions.map((question) => ({
              id: question.id,
              label: question.label,
              min_select: question.min_select,
              max_select: question.max_select,
              exclusive: question.exclusive,
              hasRegion: Boolean(question.region),
              circleCount: question.circles.length,
            }))}
            activeId={activeQuestionId}
            detecting={detecting}
            editCircles={editCircles}
            onSelect={(id) => {
              setActiveQuestionId(id);
              setEditCircles(false);
            }}
            onAdd={() => {
              const next = emptyQuestion(questions.length + 1);
              setQuestions((current) => [...current, next]);
              setActiveQuestionId(next.id);
              setEditCircles(false);
            }}
            onRemove={(id) => {
              const remaining = questions.filter((question) => question.id !== id);
              setQuestions(remaining);
              setActiveQuestionId((current) =>
                current === id ? (remaining[0]?.id ?? null) : current,
              );
              setEditCircles(false);
            }}
            onLabelChange={(id, label) => patchQuestion(id, { label })}
            onMinChange={(id, value) => patchQuestion(id, { min_select: value })}
            onMaxChange={(id, value) => patchQuestion(id, { max_select: value })}
            onExclusiveChange={(id, exclusive) =>
              patchQuestion(id, {
                exclusive,
                max_select: exclusive
                  ? 1
                  : Math.max(1, questions.find((question) => question.id === id)?.max_select ?? 1),
              })
            }
            onDetect={() => void detectActive()}
            onToggleEditCircles={(next) => {
              setEditCircles(next);
              setCanvasTool(next ? "circle" : "rect");
            }}
          />
        ) : null}
        {step === 4 ? (
          <StepReview
            name={name}
            threshold={threshold}
            onThresholdChange={setThreshold}
            questions={questions.map((question) => ({
              id: question.id,
              label: question.label,
              circleCount: question.circles.length,
              min_select: question.min_select,
              max_select: question.exclusive ? 1 : question.max_select,
              exclusive: question.exclusive,
            }))}
            markerCount={markers.length}
          />
        ) : null}

        <div className="wizard-nav">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => {
              setStep((current) => (current > 1 ? ((current - 1) as WizardStep) : current));
              setEditCircles(false);
            }}
            className="wizard-nav-btn"
          >
            {"< Prev"}
          </button>
          {step < 4 ? (
            <button
              type="button"
              disabled={!canProceed}
              onClick={() => {
                setStep((current) => (current < 4 ? ((current + 1) as WizardStep) : current));
                setEditCircles(false);
              }}
              className="wizard-nav-btn is-next"
            >
              Next{">"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!canSave || saving}
              onClick={() => void save()}
              className="wizard-nav-btn is-save"
            >
              <Save className="size-3" strokeWidth={2.2} />
              {saving ? "Saving..." : "Save"}
            </button>
          )}
        </div>
        {error ? <p className="text-sm text-mark">{error}</p> : null}
        {message ? <p className="text-sm text-ok">{message}</p> : null}
      </section>

      <section
        className="wizard-canvas-stage relative min-h-0 overflow-hidden"
        onWheel={(event) => event.stopPropagation()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void onFile(event.dataTransfer.files[0]);
        }}
      >
        {!image ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void onFile(event.dataTransfer.files[0]);
            }}
            className="wizard-canvas-empty absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 px-6 text-center"
          >
            <p className="text-sm font-medium">
              {loadingFile ? "양식을 불러오는 중..." : "빈 설문지를 여기에 놓거나 클릭하세요"}
            </p>
            <p className="text-xs leading-5 text-white/50">
              JPG / PNG / PDF · 여러 장이면 1페이지만 템플릿
            </p>
          </button>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept={FORM_FILE_ACCEPT}
          className="hidden"
          onChange={(event) => {
            void onFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <div className="wizard-canvas-float h-full min-h-0 w-full">
          <WizardCanvas
            image={image}
            mode={canvasMode()}
            tool={canvasTool}
            onToolChange={handleToolChange}
            drawEnabled={step === 3}
            markers={canvasMarkers}
            onMarkersChange={step === 2 ? setMarkers : undefined}
            region={canvasRegion}
            onRegionChange={(region) => {
              if (step === 3 && activeQuestionId) {
                patchQuestion(activeQuestionId, { region });
              }
            }}
            onRegionPaste={(region) => {
              if (step !== 3) {
                return;
              }
              const next = { ...emptyQuestion(questions.length + 1), region };
              setQuestions((current) => [...current, next]);
              setActiveQuestionId(next.id);
              setEditCircles(false);
              setCanvasTool("select");
            }}
            circles={canvasCircles}
            onCirclesChange={(circles) => {
              if (step === 3 && activeQuestionId) {
                patchQuestion(activeQuestionId, { circles });
              }
            }}
          />
        </div>
      </section>
    </div>
  );
}
