export { DetectRequestError, detectCircles, prepareDetectImage } from "./detectClient";
export {
  clearActiveTemplate,
  canDeleteTemplate,
  deleteWizardTemplate,
  isSeedTemplate,
  readActiveTemplateId,
  rememberActiveTemplate,
  saveWizardTemplate,
  seedTemplateId,
} from "./saveTemplate";
export type { DetectCirclesResult, DetectedCircle, DetectRegion } from "./types";
