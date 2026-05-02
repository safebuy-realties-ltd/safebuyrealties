import { VerificationStepType } from "@prisma/client";

export const VERIFICATION_STEP_LABELS: Record<VerificationStepType, string> = {
  [VerificationStepType.SUBMISSION]: "Submission received",
  [VerificationStepType.DOCUMENT_REVIEW]: "Document review",
  [VerificationStepType.FIELD_VERIFICATION]: "Field verification",
  [VerificationStepType.LEGAL]: "Legal validation",
  [VerificationStepType.SURVEY]: "Survey check",
  [VerificationStepType.VALUATION]: "Valuation",
  [VerificationStepType.RISK_REVIEW]: "Risk review",
  [VerificationStepType.FINAL_APPROVAL]: "Final approval",
};
