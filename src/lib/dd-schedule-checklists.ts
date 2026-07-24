/** Schedules A–D with selectable checklist items (standalone DD request). */

export const DD_SCHEDULE_CODES = [
  "LEGAL_CHECK",
  "ENVIRONMENTAL_CHECK",
  "PHYSICAL_CHECK",
  "SECURITY_CHECK",
] as const;

export type DdScheduleCode = (typeof DD_SCHEDULE_CODES)[number];

export type DdChecklistItem = {
  code: string;
  label: string;
  description?: string;
};

export type DdScheduleDefinition = {
  code: DdScheduleCode;
  letter: "A" | "B" | "C" | "D";
  name: string;
  shortName: string;
  description: string;
  /** Professional types the platform suggests for this schedule */
  suggestedProfessionalTypes: string[];
  items: DdChecklistItem[];
};

export const DD_SCHEDULES: DdScheduleDefinition[] = [
  {
    code: "LEGAL_CHECK",
    letter: "A",
    name: "Schedule A — Legal Due Diligence",
    shortName: "Legal",
    description: "Title, ownership, encumbrances, and transaction documentation.",
    suggestedProfessionalTypes: ["LAWYER"],
    items: [
      {
        code: "LEGAL_TITLE_SEARCH",
        label: "Title search & ownership chain",
        description: "Confirm registered ownership history and root of title.",
      },
      {
        code: "LEGAL_COF_O",
        label: "Certificate of Occupancy (C of O) verification",
      },
      {
        code: "LEGAL_GOVERNORS_CONSENT",
        label: "Governor's Consent verification",
      },
      {
        code: "LEGAL_DEED_OF_ASSIGNMENT",
        label: "Deed of Assignment review",
      },
      {
        code: "LEGAL_SURVEY_CHARTING",
        label: "Survey plan / land charting search",
      },
      {
        code: "LEGAL_EXCISION_GAZETTE",
        label: "Excision & gazette verification",
      },
      {
        code: "LEGAL_ENCUMBRANCE",
        label: "Encumbrance / lien search",
      },
      {
        code: "LEGAL_LITIGATION",
        label: "Litigation & court case search",
      },
      {
        code: "LEGAL_SELLER_AUTHORITY",
        label: "Seller authority / power of attorney check",
      },
      {
        code: "LEGAL_LAND_USE",
        label: "Land-use / zoning compliance",
      },
    ],
  },
  {
    code: "ENVIRONMENTAL_CHECK",
    letter: "B",
    name: "Schedule B — Environmental Review",
    shortName: "Environmental",
    description: "Flooding, drainage, soil, and neighbourhood environmental risk.",
    suggestedProfessionalTypes: ["SURVEYOR", "ENGINEER"],
    items: [
      {
        code: "ENV_FLOOD_RISK",
        label: "Flood risk assessment",
      },
      {
        code: "ENV_DRAINAGE",
        label: "Drainage & waterlogging review",
      },
      {
        code: "ENV_SOIL_TOPOGRAPHY",
        label: "Soil / topography concerns",
      },
      {
        code: "ENV_EROSION",
        label: "Erosion risk review",
      },
      {
        code: "ENV_INDUSTRIAL_PROXIMITY",
        label: "Industrial / land-use proximity",
      },
      {
        code: "ENV_POLLUTION",
        label: "Waste / pollution signals",
      },
      {
        code: "ENV_NEIGHBOURHOOD_HAZARDS",
        label: "Neighbourhood environmental hazards",
      },
    ],
  },
  {
    code: "PHYSICAL_CHECK",
    letter: "C",
    name: "Schedule C — Physical Inspection",
    shortName: "Physical",
    description: "On-site boundaries, structures, access, and visible condition.",
    suggestedProfessionalTypes: [
      "SURVEYOR",
      "VALUER",
      "ARCHITECT",
      "ENGINEER",
      "BUILDER",
      "QUANTITY_SURVEYOR",
    ],
    items: [
      {
        code: "PHYS_BOUNDARY_BEACONS",
        label: "Boundary / beacon verification",
      },
      {
        code: "PHYS_STRUCTURE_CONDITION",
        label: "Building / structure condition",
      },
      {
        code: "PHYS_ACCESS_ROW",
        label: "Access roads & right of way",
      },
      {
        code: "PHYS_UTILITIES",
        label: "Utilities (water, electricity, drainage)",
      },
      {
        code: "PHYS_MEASUREMENTS",
        label: "Site measurements vs survey plan",
      },
      {
        code: "PHYS_DEFECTS",
        label: "Visible defects / unfinished works",
      },
      {
        code: "PHYS_OCCUPANCY",
        label: "Occupancy status check",
      },
    ],
  },
  {
    code: "SECURITY_CHECK",
    letter: "D",
    name: "Schedule D — Security Assessment",
    shortName: "Security",
    description: "Neighbourhood safety, access control, and claimant risk signals.",
    suggestedProfessionalTypes: ["ENGINEER", "SURVEYOR", "LAWYER"],
    items: [
      {
        code: "SEC_NEIGHBOURHOOD",
        label: "Neighbourhood crime / security posture",
      },
      {
        code: "SEC_ACCESS_CONTROL",
        label: "Access control & perimeter",
      },
      {
        code: "SEC_OMO_ONILE",
        label: "Omo-onile / local claimant risk signals",
      },
      {
        code: "SEC_DISPUTE",
        label: "Dispute / communal conflict signals",
      },
      {
        code: "SEC_NIGHT_SAFETY",
        label: "Night-time safety assessment",
      },
      {
        code: "SEC_INFRASTRUCTURE",
        label: "Nearby security infrastructure",
      },
    ],
  },
];

export type DdChecklistSelections = Partial<Record<DdScheduleCode, string[]>>;

export function getScheduleByCode(code: string): DdScheduleDefinition | undefined {
  return DD_SCHEDULES.find((schedule) => schedule.code === code);
}

export function checklistLabel(scheduleCode: string, itemCode: string): string {
  const schedule = getScheduleByCode(scheduleCode);
  return schedule?.items.find((item) => item.code === itemCode)?.label ?? itemCode;
}

export function countSelectedItems(selections: DdChecklistSelections): number {
  return DD_SCHEDULE_CODES.reduce((total, code) => total + (selections[code]?.length ?? 0), 0);
}

export function selectedScheduleCodes(selections: DdChecklistSelections): DdScheduleCode[] {
  return DD_SCHEDULE_CODES.filter((code) => (selections[code]?.length ?? 0) > 0);
}

export function validateChecklistSelections(
  selections: DdChecklistSelections,
): { ok: true } | { ok: false; message: string } {
  const schedules = selectedScheduleCodes(selections);
  if (schedules.length === 0) {
    return { ok: false, message: "Select at least one checklist item under a schedule." };
  }

  for (const scheduleCode of schedules) {
    const schedule = getScheduleByCode(scheduleCode);
    if (!schedule) {
      return { ok: false, message: `Unknown schedule: ${scheduleCode}` };
    }
    const allowed = new Set(schedule.items.map((item) => item.code));
    for (const itemCode of selections[scheduleCode] ?? []) {
      if (!allowed.has(itemCode)) {
        return { ok: false, message: `Invalid checklist item ${itemCode} for ${scheduleCode}` };
      }
    }
  }

  return { ok: true };
}
