import * as z from "zod";

/**
 * Injects output schema into tool description.
 * Used until model provider APIs natively support outputSchema.
 *
 * @param description - The original tool description
 * @param outputSchema - Optional Zod schema for the tool's output
 * @returns The description with appended JSON schema if outputSchema is provided,
 *          otherwise returns the original description unchanged
 */
export function injectOutputSchema(
  description: string,
  outputSchema?: z.ZodType,
): string {
  if (!outputSchema) {
    return description;
  }
  const outputJsonSchema = z.toJSONSchema(outputSchema);
  return `${description}\n\n## Output Schema\n\`\`\`json\n${JSON.stringify(
    outputJsonSchema,
    null,
    2,
  )}\n\`\`\``;
}
