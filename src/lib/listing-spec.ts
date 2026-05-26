/** Optional listing spec fields on API payloads and DTOs. */
export type ListingSpecFields = {
  beds?: number | null;
  baths?: number | null;
  landAreaSqm?: number | null;
  buildType?: string | null;
};

export type CreateListingFormValues = {
  title: string;
  description: string;
  location: string;
  price: string;
  currency: string;
  beds: string;
  baths: string;
  landAreaSqm: string;
  buildType: string;
};

export type CreateListingPayload = {
  title: string;
  description: string;
  location: string;
  price: number;
  currency: string;
} & ListingSpecFields;

function parseOptionalInt(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

/** Maps seller create-form strings to POST body fields (omits empty optional specs). */
export function buildCreateListingPayload(form: CreateListingFormValues): CreateListingPayload {
  const payload: CreateListingPayload = {
    title: form.title.trim(),
    description: form.description.trim(),
    location: form.location.trim(),
    price: Number(form.price),
    currency: form.currency.trim() || "NGN",
  };

  const beds = parseOptionalInt(form.beds);
  if (beds !== undefined) payload.beds = beds;

  const baths = parseOptionalInt(form.baths);
  if (baths !== undefined) payload.baths = baths;

  const landAreaSqm = parseOptionalInt(form.landAreaSqm);
  if (landAreaSqm !== undefined) payload.landAreaSqm = landAreaSqm;

  const buildType = form.buildType.trim();
  if (buildType) payload.buildType = buildType;

  return payload;
}

export function formatSpecCount(
  value: number | null | undefined,
  singular: string,
  plural = `${singular}s`,
): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const label = value === 1 ? singular : plural;
  return `${value} ${label}`;
}

export function formatLandAreaSqm(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${value} m²`;
}

/** Human-readable build type (title case for simple enum-like values). */
export function formatBuildType(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const normalized = value.trim().replace(/_/g, " ");
  return normalized
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** Joins present spec parts for detail rows, e.g. "4 beds · 3 baths". */
export function formatListingSpecSummary(spec: ListingSpecFields): string {
  const parts = [
    formatSpecCount(spec.beds, "bed"),
    formatSpecCount(spec.baths, "bath"),
    formatLandAreaSqm(spec.landAreaSqm ?? undefined),
    formatBuildType(spec.buildType ?? undefined),
  ].filter((p): p is string => !!p);

  return parts.length > 0 ? parts.join(" · ") : "—";
}
