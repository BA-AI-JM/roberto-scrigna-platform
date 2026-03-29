/**
 * Shared domain types for the Roberto Scrigna platform.
 * Nutrition-specific types will live in their own modules (e.g. types/nutrition.ts).
 */

export type UserId = string;

export interface UserProfile {
  id: UserId;
  email: string;
  fullName: string | null;
  createdAt: Date;
  updatedAt: Date;
}
