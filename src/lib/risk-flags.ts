export type RiskFlag = {
  code: string;
  label: string;
  description: string;
};

export const RISK_FLAGS: RiskFlag[] = [
  {
    code: "BOUNDARY_DISPUTE",
    label: "Boundary Dispute",
    description: "Uncertainty or conflict over the property's physical boundaries",
  },
  {
    code: "GOVT_ACQUISITION",
    label: "Government Acquisition",
    description: "Evidence or risk of compulsory government acquisition",
  },
  {
    code: "FLOOD_ZONE",
    label: "Flood Zone",
    description: "Property is located in a known flood-prone area",
  },
  {
    code: "OMO_ONILE_ACTIVITY",
    label: "Omo-Onile Activity",
    description: "Known or suspected land-grabbing activity in the area",
  },
  {
    code: "TITLE_ENCUMBRANCE",
    label: "Title Encumbrance",
    description: "Existing charges, liens, or encumbrances on the title",
  },
  {
    code: "LITIGATION_PENDING",
    label: "Pending Litigation",
    description: "Active or threatened litigation involving the property",
  },
  {
    code: "SURVEY_DISCREPANCY",
    label: "Survey Discrepancy",
    description: "Mismatch between survey plan and physical boundaries",
  },
  {
    code: "INCOMPLETE_DOCUMENTS",
    label: "Incomplete Documents",
    description: "Key legal documents are missing or incomplete",
  },
];

export function riskFlagLabel(code: string): string {
  const flag = RISK_FLAGS.find((f) => f.code === code);
  return flag ? flag.label : code;
}
