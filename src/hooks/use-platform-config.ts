import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export type PlatformConfigDto = {
  id?: string;
  vatRate: string;
  maxUploadMb: number;
  paystackEnabled?: boolean;
  flutterwaveEnabled?: boolean;
  maintenanceMode?: boolean;
  updatedAt?: string;
};

export type UpdatePlatformConfigBody = {
  vatRate?: number;
  maxUploadMb?: number;
  paystackEnabled?: boolean;
  flutterwaveEnabled?: boolean;
  maintenanceMode?: boolean;
};

export function usePlatformConfigQuery() {
  const { isReady, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["platform-config"],
    queryFn: async () => {
      const env = await apiRequest<PlatformConfigDto>("/platform-config");
      return env.data;
    },
    enabled: isReady && isAuthenticated,
  });
}

export function useUpdatePlatformConfigMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePlatformConfigBody) =>
      apiRequest<PlatformConfigDto>("/platform-config", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["platform-config"] });
    },
  });
}
