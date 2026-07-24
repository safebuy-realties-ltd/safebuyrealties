import { SetMetadata } from "@nestjs/common";
import type { Permission } from "../permissions";

export const PERMISSIONS_KEY = "permissions";

/** Require all listed permissions (in addition to any @Roles check). */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
