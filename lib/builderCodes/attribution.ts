import { parseBuilderCodeFromCalldata } from "@/lib/builderCodes/parser";

export interface BuilderCodeAttributionInput {
  hash: string;
  input: string;
  from?: string;
  to?: string;
}

export interface BuilderCodeAttribution {
  transactionHash: string;
  builderCodeFound: boolean;
  builderCode?: string;
  confidence: "low" | "medium" | "high";
  source: "builder_codes";
  reason?: string;
  rawSuffix?: string;
  from?: string;
  to?: string;
}

export function attributeTransaction(
  input: BuilderCodeAttributionInput
): BuilderCodeAttribution {
  const parsed = parseBuilderCodeFromCalldata(input.input);

  if (!parsed.found || !parsed.builderCode) {
    return {
      transactionHash: input.hash,
      builderCodeFound: false,
      confidence: "low",
      source: "builder_codes",
      reason: parsed.reason,
      ...(input.from ? { from: input.from } : {}),
      ...(input.to ? { to: input.to } : {})
    };
  }

  return {
    transactionHash: input.hash,
    builderCodeFound: true,
    builderCode: parsed.builderCode,
    // The MVP parser recognizes the known schema-0 suffix shape, but the
    // standard and registry tooling are still expected to evolve. We keep this
    // at low confidence until registry validation and richer decoding are added.
    confidence: "low",
    source: "builder_codes",
    reason: parsed.reason,
    rawSuffix: parsed.rawSuffix,
    ...(input.from ? { from: input.from } : {}),
    ...(input.to ? { to: input.to } : {})
  };
}
