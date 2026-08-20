"use client";

type ReviewQuestion = {
  id: string;
  label: string;
  circleCount: number;
  min_select: number;
  max_select: number;
  exclusive: boolean;
};

type Props = {
  name: string;
  threshold: number;
  onThresholdChange: (value: number) => void;
  questions: ReviewQuestion[];
  markerCount: number;
};

export function StepReview({
  name,
  threshold,
  onThresholdChange,
  questions,
  markerCount,
}: Props) {
  return (
    <div className="space-y-4">
      <p className="wizard-hint">
        원 오버레이를 확인하고 채움 임계값을 맞춘 뒤 저장하세요. 저장 전에는 스캔 채점에 쓰이지
        않습니다.
      </p>
      <p className="text-[0.75rem]">
        {name || "Untitled"}
        <span className="ml-2 text-white/50">
          Corners {markerCount}/4 · Questions {questions.length}
        </span>
      </p>
      <label className="wizard-field">
        Fill threshold {threshold.toFixed(2)}
        <input
          type="range"
          min={0.15}
          max={0.6}
          step={0.01}
          value={threshold}
          onChange={(event) => onThresholdChange(Number(event.target.value))}
          className="wizard-range"
        />
        <span className="mt-1 block text-[0.6875rem] font-normal text-white/50">
          인쇄된 원 안쪽이 이 비율 이상 어두우면 선택입니다. 낮출수록 연한 체크도 잡힙니다.
        </span>
      </label>
      <ul className="space-y-1 rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-[0.6875rem] text-white/50">
        {questions.map((question, index) => (
          <li key={question.id}>
            {question.label || `문항 ${index + 1}`} · {question.circleCount} circles ·{" "}
            {question.exclusive ? "single" : `multi (max ${question.max_select})`} · min{" "}
            {question.min_select}
          </li>
        ))}
      </ul>
    </div>
  );
}
