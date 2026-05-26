import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export type ServiceCatalogItem = {
  id: string;
  code: string;
  name: string;
  description: string;
  basePrice: string;
  active: boolean;
  sortOrder: number;
};

export type ServiceBundle = {
  id: string;
  code: string;
  name: string;
  description: string;
  basePrice: string;
  active: boolean;
  items: ServiceCatalogItem[];
};

export type CalculateResult = {
  subtotal: string;
  vat: string;
  total: string;
};

export function useServiceItemsQuery() {
  return useQuery({
    queryKey: ["service-catalog", "items"],
    queryFn: () => apiRequest<ServiceCatalogItem[]>("/service-catalog/items"),
    select: (envelope) => envelope.data,
  });
}

export function useServiceBundlesQuery() {
  return useQuery({
    queryKey: ["service-catalog", "bundles"],
    queryFn: () => apiRequest<ServiceBundle[]>("/service-catalog/bundles"),
    select: (envelope) => envelope.data,
  });
}

export function useCalculateMutation() {
  return useMutation({
    mutationFn: (body: { bundleId?: string; itemIds?: string[] }) =>
      apiRequest<CalculateResult>("/service-catalog/calculate", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}
