/** Relative [0–1] rectangle on the blank form image. */
export type DetectRegion = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Circle candidate in the same relative space as DetectRegion. */
export type DetectedCircle = {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
};

export type DetectCirclesResult = {
  circles: DetectedCircle[];
  rejected_count: number;
};
