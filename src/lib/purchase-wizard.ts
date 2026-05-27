export const WIZARD_STEPS = [
  "PROPERTY_CONFIRMATION",
  "BUYER_INFO",
  "POA_EXECUTION",
  "SERVICE_SELECTION",
  "ORDER_SUMMARY",
  "PAYMENT",
  "SUCCESS",
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

export type BuyerInfo = {
  legalName: string;
  email: string;
  phone: string;
  country: string;
  state: string;
};

export type ServiceSelection = {
  bundleId?: string;
  itemIds: string[];
  subtotal: number;
  vat: number;
  total: number;
};

export type PurchaseWizardState = {
  step: WizardStep;
  buyerInfo?: BuyerInfo;
  poaSkipped?: boolean;
  poaId?: string;
  serviceSelection?: ServiceSelection;
  transactionId?: string;
  ddOrderId?: string;
  paymentId?: string;
  paymentReference?: string;
};

export function wizardStorageKey(listingId: string): string {
  return `purchase-wizard:${listingId}`;
}

export function defaultWizardState(): PurchaseWizardState {
  return { step: "PROPERTY_CONFIRMATION" };
}

export function loadWizardState(listingId: string): PurchaseWizardState | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(wizardStorageKey(listingId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PurchaseWizardState;
    if (!parsed.step || !WIZARD_STEPS.includes(parsed.step)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveWizardState(listingId: string, state: PurchaseWizardState): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(wizardStorageKey(listingId), JSON.stringify(state));
}

export function clearWizardState(listingId: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(wizardStorageKey(listingId));
}

export function stepIndex(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step);
}

export function stepProgressPercent(step: WizardStep): number {
  const idx = stepIndex(step);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / WIZARD_STEPS.length) * 100);
}

export function stepLabel(step: WizardStep): string {
  const labels: Record<WizardStep, string> = {
    PROPERTY_CONFIRMATION: "Property",
    BUYER_INFO: "Your details",
    POA_EXECUTION: "Power of Attorney",
    SERVICE_SELECTION: "Services",
    ORDER_SUMMARY: "Summary",
    PAYMENT: "Payment",
    SUCCESS: "Complete",
  };
  return labels[step];
}

export function isBuyerInfoComplete(info: BuyerInfo | undefined): info is BuyerInfo {
  if (!info) return false;
  return (
    info.legalName.trim().length > 0 &&
    info.email.trim().length > 0 &&
    info.phone.trim().length > 0 &&
    info.country.trim().length > 0 &&
    info.state.trim().length > 0
  );
}

export function isServiceSelectionValid(selection: ServiceSelection | undefined): boolean {
  if (!selection) return false;
  return selection.total > 0 && (selection.itemIds.length > 0 || !!selection.bundleId);
}
