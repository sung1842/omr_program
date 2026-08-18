"use client";

import type { KonvaEventObject } from "konva/lib/Node";
import { useEffect, useMemo, useRef, useState } from "react";
import { Ellipse, Layer, Rect, Stage, Text, Image as KonvaImage } from "react-konva";
import { createVillageAgendaQuestions, nextOptionDef, VILLAGE_AGENDA_FORM } from "@/lib/formSpec";
import { assignCornerIds, clampRect, fromRelative, toRelative } from "@/lib/geometry";
import { FORM_FILE_ACCEPT, loadFormImage } from "@/lib/loadFormImage";
import { takePendingTemplateFile } from "@/lib/pendingTemplateFile";
import { normalizeQuestion } from "@/lib/results";
import { createClient } from "@/lib/supabase/client";
import {
  MARKER_LABELS,
  MAX_MARKERS,
  type Marker,
  type MarkerShape,
  type Question,
  type TemplateRow,
} from "@/lib/types";

type Mode = "marker" | "cell" | "circle";

type DraftMarker = {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

type Props = {
  initial?: TemplateRow | null;
};

export default function TemplateEditor({ initial }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 640 });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [name, setName] = useState(initial?.name ?? VILLAGE_AGENDA_FORM.name);
  const [shape, setShape] = useState<MarkerShape>(initial?.marker_shape ?? "square");
  const [threshold, setThreshold] = useState(() => {
    const value = initial?.fill_threshold ?? VILLAGE_AGENDA_FORM.fill_threshold;
    if (value >= 0.2 && value <= 0.95) {
      return value;
    }
    return VILLAGE_AGENDA_FORM.fill_threshold;
  });
  const [mode, setMode] = useState<Mode>("marker");
  const [markers, setMarkers] = useState<DraftMarker[]>([]);
  const [questions, setQuestions] = useState<Question[]>(() =>
    initial?.questions?.length
      ? initial.questions.map(normalizeQuestion)
      : createVillageAgendaQuestions(),
  );
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(
    initial?.questions[0]?.id ?? null,
  );
  const [drawing, setDrawing] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const [scale, setScale] = useState(1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeQuestion = questions.find((question) => question.id === activeQuestionId) ?? null;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }
    const observer = new ResizeObserver(() => {
      setStageSize({
        width: Math.max(320, node.clientWidth),
        height: Math.max(420, node.clientHeight),
      });
    });
    observer.observe(node);
    setStageSize({
      width: Math.max(320, node.clientWidth),
      height: Math.max(420, node.clientHeight),
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setActiveQuestionId((current) => current ?? questions[0]?.id ?? null);
  }, [questions]);

  const fit = useMemo(() => {
    if (!image) {
      return 1;
    }
    return Math.min(stageSize.width / image.width, stageSize.height / image.height, 1);
  }, [image, stageSize.height, stageSize.width]);

  const imageX = image ? (stageSize.width - image.width * fit) / 2 : 0;
  const imageY = image ? (stageSize.height - image.height * fit) / 2 : 0;

  function toImagePoint(stageX: number, stageY: number) {
    if (!image) {
      return { x: 0, y: 0 };
    }
    return {
      x: (stageX / scale - imageX) / fit,
      y: (stageY / scale - imageY) / fit,
    };
  }

  async function onFile(file: File | undefined) {
    if (!file) {
      return;
    }
    setLoadingFile(true);
    setError(null);
    setMessage(null);
    try {
      const next = await loadFormImage(file);
      setImage(next);
      setFileName(file.name);
      setScale(1);
      if (initial && markers.length === 0 && initial.markers.length === 4) {
        setMarkers(
          initial.markers.map((marker) => {
            const rect = fromRelative(marker, next.width, next.height);
            return { key: marker.id, ...rect };
          }),
        );
      }
      if (initial?.questions.length) {
        setQuestions(initial.questions.map(normalizeQuestion));
      }
      setMessage(`${file.name} 파일을 올렸습니다. 표 모서리 4개를 그리세요.`);
    } catch (loadError) {
      setImage(null);
      setFileName(null);
      setError(loadError instanceof Error ? loadError.message : "파일을 열 수 없습니다.");
    } finally {
      setLoadingFile(false);
    }
  }

  useEffect(() => {
    const pending = takePendingTemplateFile();
    if (pending) {
      void onFile(pending);
    }
    // Load a file handed off from the 양식 학습 drop zone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onMouseDown(event: KonvaEventObject<MouseEvent>) {
    if (!image) {
      return;
    }
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) {
      return;
    }
    const point = toImagePoint(pointer.x, pointer.y);
    if (point.x < 0 || point.y < 0 || point.x > image.width || point.y > image.height) {
      return;
    }
    if (mode === "marker" && markers.length >= MAX_MARKERS) {
      return;
    }
    if (mode === "cell" && !activeQuestionId) {
      setError("문항을 먼저 선택하세요.");
      return;
    }
    if (mode === "circle") {
      const target = questions.find((question) => question.id === activeQuestionId);
      if (!target || target.options.length === 0) {
        setError("기표 칸을 먼저 그린 뒤 원을 그리세요.");
        return;
      }
    }
    setDrawing({ x: point.x, y: point.y, w: 1, h: 1 });
    setError(null);
  }

  function onMouseMove(event: KonvaEventObject<MouseEvent>) {
    if (!drawing || !image) {
      return;
    }
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) {
      return;
    }
    const point = toImagePoint(pointer.x, pointer.y);
    setDrawing({
      ...drawing,
      w: point.x - drawing.x,
      h: point.y - drawing.y,
    });
  }

  function onMouseUp() {
    if (!drawing || !image) {
      return;
    }
    const rect = clampRect(drawing.x, drawing.y, drawing.w, drawing.h, image.width, image.height);
    setDrawing(null);
    if (rect.w < 6 || rect.h < 6) {
      return;
    }
    if (mode === "marker") {
      if (markers.length >= MAX_MARKERS) {
        return;
      }
      setMarkers((current) => [...current, { key: crypto.randomUUID(), ...rect }]);
      return;
    }
    if (!activeQuestionId) {
      return;
    }
    const rel = toRelative(rect, image.width, image.height);
    if (mode === "circle") {
      setQuestions((current) =>
        current.map((question) => {
          if (question.id !== activeQuestionId) {
            return question;
          }
          const cx = rel.x + rel.w / 2;
          const cy = rel.y + rel.h / 2;
          const containing = question.options.findIndex(
            (option) =>
              cx >= option.x &&
              cy >= option.y &&
              cx <= option.x + option.w &&
              cy <= option.y + option.h,
          );
          const missing = question.options.findIndex((option) => !option.circle);
          const index = containing >= 0 ? containing : missing;
          if (index < 0) {
            return question;
          }
          return {
            ...question,
            options: question.options.map((option, optionIndex) =>
              optionIndex === index ? { ...option, circle: rel } : option,
            ),
          };
        }),
      );
      return;
    }
    setQuestions((current) =>
      current.map((question) => {
        if (question.id !== activeQuestionId) {
          return question;
        }
        const preset = nextOptionDef(question);
        const label = preset?.label ?? String(question.options.length + 1);
        const title = preset?.title;
        return {
          ...question,
          options: [
            ...question.options,
            {
              id: crypto.randomUUID(),
              label,
              title,
              ...rel,
            },
          ],
        };
      }),
    );
  }

  function loadVillageForm() {
    const next = createVillageAgendaQuestions();
    setName(VILLAGE_AGENDA_FORM.name);
    setShape(VILLAGE_AGENDA_FORM.marker_shape);
    setThreshold(VILLAGE_AGENDA_FORM.fill_threshold);
    setQuestions(next);
    setActiveQuestionId(next[0]?.id ?? null);
    setMode("cell");
    setMessage("신사2동 마을의제 문항을 불러왔습니다. 표 모서리 → 기표 칸 15개 → 원 15개 순서로 그리세요.");
    setError(null);
  }

  function addQuestion() {
    const number = (questions.at(-1)?.number ?? 0) + 1;
    const id = crypto.randomUUID();
    setQuestions((current) => [
      ...current,
      {
        id,
        number,
        label: `문항 ${number}`,
        type: "multi",
        min_select: 0,
        max_select: 1,
        on_overflow: "exception",
        options: [],
      },
    ]);
    setActiveQuestionId(id);
    setMode("cell");
  }

  function updateQuestion(id: string, patch: Partial<Question>) {
    setQuestions((current) =>
      current.map((question) => (question.id === id ? { ...question, ...patch } : question)),
    );
  }

  function removeLastOption() {
    if (!activeQuestionId) {
      return;
    }
    setQuestions((current) =>
      current.map((question) =>
        question.id === activeQuestionId
          ? { ...question, options: question.options.slice(0, -1) }
          : question,
      ),
    );
  }

  async function save() {
    if (!image) {
      setError("빈 설문지 샘플 이미지를 업로드하세요.");
      return;
    }
    if (markers.length !== 4) {
      setError("표 모서리 기준점을 4개 그려 주세요.");
      return;
    }
    if (questions.length === 0 || questions.some((question) => question.options.length === 0)) {
      setError("모든 문항에 하나 이상의 마킹 영역이 필요합니다.");
      return;
    }

    const assigned = assignCornerIds(markers.map((marker) => ({ id: marker.key, ...marker })));
    const payloadMarkers: Marker[] = assigned.map((marker) => ({
      id: marker.id,
      shape,
      ...toRelative(marker, image.width, image.height),
    }));

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const session = await supabase.auth.getUser();
      if (session.error || !session.data.user) {
        throw new Error("로그인이 필요합니다.");
      }
      const payload = {
        name,
        image_width: image.width,
        image_height: image.height,
        marker_shape: shape,
        markers: payloadMarkers,
        questions: questions.map(normalizeQuestion),
        fill_threshold: threshold,
        updated_at: new Date().toISOString(),
      };
      if (initial?.id) {
        const { error: updateError } = await supabase
          .from("templates")
          .update(payload)
          .eq("id", initial.id);
        if (updateError) {
          throw updateError;
        }
      } else {
        const { error: insertError } = await supabase.from("templates").insert({
          ...payload,
          created_by: session.data.user.id,
        });
        if (insertError) {
          throw insertError;
        }
      }
      setMessage("템플릿을 저장했습니다. 이후 스캔본은 이 좌표를 기준으로 채점됩니다.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const labeledMarkers =
    markers.length === 4
      ? assignCornerIds(markers.map((marker) => ({ id: marker.key, ...marker }))).map(
          (marker) => ({
            key: marker.id,
            cornerId: marker.id,
            x: marker.x,
            y: marker.y,
            w: marker.w,
            h: marker.h,
          }),
        )
      : markers.map((marker) => ({
          key: marker.key,
          cornerId: "",
          x: marker.x,
          y: marker.y,
          w: marker.w,
          h: marker.h,
        }));

  const specCount =
    activeQuestion &&
    VILLAGE_AGENDA_FORM.questions.find((item) => item.number === activeQuestion.number)?.options
      .length;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,18.75rem)_minmax(0,1fr)]">
      <section className="space-y-4 rounded-lg border border-line bg-paper-strong p-4">
        <label className="block text-sm">
          양식 이름
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded border border-line bg-white px-3 py-2"
          />
        </label>
        <button
          type="button"
          onClick={loadVillageForm}
          className="w-full rounded border border-navy px-3 py-2 text-sm text-navy"
        >
          신사2동 마을의제 문항 불러오기
        </button>
        <label className="block text-sm">
          빈 설문지 샘플
          <input
            ref={fileInputRef}
            type="file"
            accept={FORM_FILE_ACCEPT}
            className="mt-1 block w-full text-sm"
            onChange={(event) => {
              void onFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
        <p className="text-[0.6875rem] leading-4 text-muted">
          JPG, PNG, PDF를 올릴 수 있습니다. PDF는 첫 페이지만 사용합니다.
          {fileName ? ` 현재: ${fileName}` : ""}
          {loadingFile ? " 불러오는 중..." : ""}
        </p>
        <label className="block text-sm">
          기준점 형태
          <select
            value={shape}
            onChange={(event) => setShape(event.target.value as MarkerShape)}
            className="mt-1 w-full rounded border border-line bg-white px-3 py-2"
          >
            <option value="square">사각형</option>
            <option value="circle">원형</option>
          </select>
        </label>
        <label className="block text-sm">
          원 채움 임계값 {threshold.toFixed(2)}
          <input
            type="range"
            min={0.15}
            max={0.60}
            step={0.01}
            value={threshold}
            onChange={(event) => setThreshold(Number(event.target.value))}
            className="mt-1 w-full"
          />
          <span className="mt-1 block text-[0.6875rem] text-muted">
            인쇄된 원 안쪽이 이 비율 이상 어두우면 선택입니다. 낮출수록 연한 체크도 잡힙니다.
            특화·시설은 2개 이상이면 개수 예외로 처리합니다. 옆 칸 넘침은 보지 않습니다.
          </span>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("marker")}
            className={`flex-1 rounded px-2 py-2 text-sm ${mode === "marker" ? "bg-navy text-white" : "border border-line"}`}
          >
            표 모서리 {markers.length}/{MAX_MARKERS}
          </button>
          <button
            type="button"
            onClick={() => setMode("cell")}
            className={`flex-1 rounded px-2 py-2 text-sm ${mode === "cell" ? "bg-navy text-white" : "border border-line"}`}
          >
            기표 칸
          </button>
          <button
            type="button"
            onClick={() => setMode("circle")}
            className={`flex-1 rounded px-2 py-2 text-sm ${mode === "circle" ? "bg-navy text-white" : "border border-line"}`}
          >
            원
          </button>
        </div>
        <p className="text-xs leading-5 text-muted">
          기준점은 표 외곽 네 모서리입니다. 기표는 칸(cell)과 그 안 원(circle)만 씁니다.
          선택 여부는 원 안 채움으로 보고, 특화·시설 2개 이상·일반 5개 이상은 개수 예외입니다.
        </p>
        <ul className="space-y-1 rounded border border-line bg-white px-3 py-2 text-[0.6875rem] text-muted">
          <li>설문지 {image ? "업로드됨" : "필요"}</li>
          <li>표 모서리 {markers.length}/4</li>
          {VILLAGE_AGENDA_FORM.questions.map((spec) => {
            const question = questions.find((item) => item.number === spec.number);
            return (
              <li key={spec.number}>
                {spec.label} 칸 {question?.options.length ?? 0}/{spec.options.length} · 원{" "}
                {question?.options.filter((option) => option.circle).length ?? 0}/
                {spec.options.length}
              </li>
            );
          })}
        </ul>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium">문항 그룹</h2>
            <button type="button" onClick={addQuestion} className="text-sm text-navy underline">
              그룹 추가
            </button>
          </div>
          <ul className="space-y-2">
            {questions.map((question) => (
              <li key={question.id} className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveQuestionId(question.id);
                    setMode("cell");
                  }}
                  className={`w-full rounded border px-3 py-2 text-left text-sm ${
                    activeQuestionId === question.id ? "border-navy bg-navy/5" : "border-line"
                  }`}
                >
                  {question.label}
                  <span className="ml-2 text-muted">
                    {question.options.length}칸 · 원{" "}
                    {question.options.filter((option) => option.circle).length} · 최대 {question.max_select}개
                  </span>
                </button>
                {activeQuestionId === question.id ? (
                  <div className="space-y-2 rounded border border-line bg-white p-2">
                    <label className="block text-xs">
                      최대 선택
                      <input
                        type="number"
                        min={0}
                        value={question.max_select}
                        onChange={(event) =>
                          updateQuestion(question.id, {
                            max_select: Math.max(0, Number(event.target.value) || 0),
                          })
                        }
                        className="mt-1 w-full rounded border border-line px-2 py-1"
                      />
                    </label>
                    <p className="text-[0.6875rem] leading-4 text-muted">
                      {mode === "circle"
                        ? `다음 원: ${question.options.find((option) => !option.circle)?.label ?? "완료"}`
                        : specCount
                          ? `다음 칸: ${nextOptionDef(question)?.label ?? "완료"} (${question.options.length}/${specCount})`
                          : "기표란 네모 칸을 위→아래로 그리세요."}
                    </p>
                    <ul className="space-y-1 text-[0.6875rem] text-muted">
                      {question.options.map((option) => (
                        <li key={option.id}>
                          {option.label}
                          {option.circle ? " · 원있음" : " · 원없음"}
                          {option.title ? ` · ${option.title}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setMarkers((current) => current.slice(0, -1))}
            className="text-sm text-muted underline"
          >
            마지막 기준점 삭제
          </button>
          <button type="button" onClick={removeLastOption} className="text-sm text-muted underline">
            마지막 칸 삭제
          </button>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="w-full rounded bg-navy px-4 py-2.5 text-sm text-white disabled:opacity-50"
        >
          {saving ? "저장 중..." : "템플릿 저장"}
        </button>
        {error ? <p className="text-sm text-mark">{error}</p> : null}
        {message ? <p className="text-sm text-ok">{message}</p> : null}
      </section>

      <section
        className="relative overflow-hidden rounded-lg border border-line bg-[#ece6da]"
        onDragOver={(event) => {
          event.preventDefault();
        }}
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
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#ece6da] px-6 text-center"
          >
            <p className="text-sm font-medium text-ink">
              {loadingFile ? "양식을 불러오는 중..." : "빈 설문지를 여기에 놓거나 클릭하세요"}
            </p>
            <p className="text-xs leading-5 text-muted">
              신사2동 마을의제 용지 · JPG / PNG / PDF
              <br />
              표 모서리 4개, 기표 칸 15개, 원 15개를 그립니다.
            </p>
          </button>
        ) : null}
        <div ref={containerRef} className="h-[min(72vh,760px)] w-full">
          <Stage
            width={stageSize.width}
            height={stageSize.height}
            scaleX={scale}
            scaleY={scale}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={(event) => {
              event.evt.preventDefault();
              const next = event.evt.deltaY > 0 ? scale * 0.95 : scale * 1.05;
              setScale(Math.min(3, Math.max(0.5, next)));
            }}
            style={{ cursor: image ? "crosshair" : "default" }}
          >
            <Layer>
              {image ? (
                <KonvaImage image={image} x={imageX} y={imageY} width={image.width * fit} height={image.height * fit} />
              ) : null}
              {labeledMarkers.map((marker) => (
                <Rect
                  key={marker.key}
                  x={imageX + marker.x * fit}
                  y={imageY + marker.y * fit}
                  width={marker.w * fit}
                  height={marker.h * fit}
                  stroke="#243044"
                  strokeWidth={2}
                  fill="rgba(36,48,68,0.18)"
                />
              ))}
              {labeledMarkers.map((marker) => (
                <Text
                  key={`${marker.key}-label`}
                  x={imageX + marker.x * fit}
                  y={imageY + marker.y * fit - 16}
                  text={MARKER_LABELS[marker.cornerId] ?? "기준점"}
                  fill="#243044"
                  fontSize={12}
                />
              ))}
              {image
                ? questions.flatMap((question) =>
                    question.options.map((option) => {
                      const rect = fromRelative(option, image.width, image.height);
                      const active = question.id === activeQuestionId;
                      return (
                        <Rect
                          key={option.id}
                          x={imageX + rect.x * fit}
                          y={imageY + rect.y * fit}
                          width={rect.w * fit}
                          height={rect.h * fit}
                          stroke={active ? "#9b2c2c" : "#9a6700"}
                          strokeWidth={active ? 2 : 1}
                          fill={active ? "rgba(155,44,44,0.16)" : "rgba(154,103,0,0.1)"}
                        />
                      );
                    }),
                  )
                : null}
              {image
                ? questions.flatMap((question) =>
                    question.options.flatMap((option) => {
                      if (!option.circle) {
                        return [];
                      }
                      const circle = fromRelative(option.circle, image.width, image.height);
                      return [
                        <Ellipse
                          key={`${option.id}-circle`}
                          x={imageX + (circle.x + circle.w / 2) * fit}
                          y={imageY + (circle.y + circle.h / 2) * fit}
                          radiusX={(circle.w / 2) * fit}
                          radiusY={(circle.h / 2) * fit}
                          stroke="#1d4ed8"
                          strokeWidth={2}
                          fill="rgba(29,78,216,0.12)"
                        />,
                      ];
                    }),
                  )
                : null}
              {image
                ? questions.flatMap((question) =>
                    question.options.map((option) => {
                      const rect = fromRelative(option, image.width, image.height);
                      return (
                        <Text
                          key={`${option.id}-label`}
                          x={imageX + rect.x * fit}
                          y={imageY + rect.y * fit - 14}
                          text={option.label}
                          fill="#9b2c2c"
                          fontSize={11}
                        />
                      );
                    }),
                  )
                : null}
              {drawing && image ? (
                <Rect
                  x={imageX + Math.min(drawing.x, drawing.x + drawing.w) * fit}
                  y={imageY + Math.min(drawing.y, drawing.y + drawing.h) * fit}
                  width={Math.abs(drawing.w) * fit}
                  height={Math.abs(drawing.h) * fit}
                  stroke="#9b2c2c"
                  dash={[4, 4]}
                />
              ) : null}
            </Layer>
          </Stage>
        </div>
      </section>
    </div>
  );
}
