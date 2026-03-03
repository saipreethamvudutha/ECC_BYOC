/**
 * Auto-Tag Rule Engine
 *
 * Evaluates auto-tag rules against asset fields and applies matching tags.
 * Called after asset creation to automatically categorize assets.
 *
 * Condition format: { field: string, operator: string, value: string }
 * Supported operators: equals, contains, startsWith, endsWith, regex, notEquals
 * Supported fields: name, type, hostname, ipAddress, os, criticality
 */

import { prisma } from "./prisma";

export interface AutoTagCondition {
  field: string;
  operator: "equals" | "contains" | "startsWith" | "endsWith" | "regex" | "notEquals";
  value: string;
}

interface AssetFields {
  name: string;
  type: string;
  hostname: string | null;
  ipAddress: string | null;
  os: string | null;
  criticality: string;
}

/**
 * Evaluate a single condition against an asset's fields.
 */
function evaluateCondition(condition: AutoTagCondition, asset: AssetFields): boolean {
  const fieldValue = (asset[condition.field as keyof AssetFields] || "").toString().toLowerCase();
  const targetValue = condition.value.toLowerCase();

  switch (condition.operator) {
    case "equals":
      return fieldValue === targetValue;
    case "notEquals":
      return fieldValue !== targetValue;
    case "contains":
      return fieldValue.includes(targetValue);
    case "startsWith":
      return fieldValue.startsWith(targetValue);
    case "endsWith":
      return fieldValue.endsWith(targetValue);
    case "regex":
      try {
        const regex = new RegExp(condition.value, "i");
        return regex.test(fieldValue);
      } catch {
        // Invalid regex — treat as no match
        return false;
      }
    default:
      return false;
  }
}

/**
 * Apply auto-tag rules to an asset.
 *
 * Loads all active rules for the tenant, evaluates each condition,
 * and creates AssetTag entries for matching rules.
 *
 * @param tenantId - The tenant UUID
 * @param assetId  - The asset UUID
 * @returns Array of applied tag IDs
 */
export async function applyAutoTagRules(
  tenantId: string,
  assetId: string
): Promise<string[]> {
  // Load the asset
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: {
      name: true,
      type: true,
      hostname: true,
      ipAddress: true,
      os: true,
      criticality: true,
    },
  });

  if (!asset) return [];

  // Load active auto-tag rules, ordered by priority (higher first)
  const rules = await prisma.autoTagRule.findMany({
    where: { tenantId, isActive: true },
    orderBy: { priority: "desc" },
    include: { tag: true },
  });

  if (rules.length === 0) return [];

  const appliedTagIds: string[] = [];

  for (const rule of rules) {
    try {
      const condition: AutoTagCondition = JSON.parse(rule.condition);

      if (evaluateCondition(condition, asset)) {
        // Check if tag is already assigned
        const existing = await prisma.assetTag.findUnique({
          where: {
            assetId_tagId: { assetId, tagId: rule.tagId },
          },
        });

        if (!existing) {
          await prisma.assetTag.create({
            data: { assetId, tagId: rule.tagId },
          });
          appliedTagIds.push(rule.tagId);
        }
      }
    } catch {
      // Skip rules with invalid condition JSON
      console.warn(`Auto-tag rule ${rule.id} has invalid condition: ${rule.condition}`);
    }
  }

  return appliedTagIds;
}
