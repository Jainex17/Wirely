export interface WireQualityReport {
  score: number;
  violations: string[];
  isRenderable: boolean;
  needsRepair: boolean;
}

interface EvaluateWireHtmlQualityOptions {
  html: string;
  allowImages: boolean;
  userPrompt: string;
  stylePresetId?: string;
}

const clampScore = (value: number) => Math.max(0, Math.min(100, value));

const hasClassPattern = (html: string, pattern: RegExp) => pattern.test(html);

const getEmojiCount = (value: string) =>
  (value.match(/\p{Extended_Pictographic}/gu) ?? []).length;

export const evaluateWireHtmlQuality = ({
  html,
  allowImages,
  userPrompt,
}: EvaluateWireHtmlQualityOptions): WireQualityReport => {
  let score = 100;
  const violations: string[] = [];

  const hasHtmlTag = /<html[\s>]/i.test(html) && /<\/html>/i.test(html);
  const hasBodyTag = /<body[\s>]/i.test(html) && /<\/body>/i.test(html);
  const hasBodyBackgroundClass =
    /<body[^>]*class\s*=\s*(".*?\bbg-[^"]*?"|'.*?\bbg-[^']*?')/i.test(html);
  const hasBodyTextClass =
    /<body[^>]*class\s*=\s*(".*?\btext-[^"]*?"|'.*?\btext-[^']*?')/i.test(html);
  const hasMainTag = /<main[\s>]/i.test(html) && /<\/main>/i.test(html);
  const hasHeaderTag = /<header[\s>]/i.test(html);
  const hasFooterTag = /<footer[\s>]/i.test(html);
  const sectionCount = (html.match(/<section[\s>]/gi) ?? []).length;

  if (!hasHtmlTag || !hasBodyTag || !hasMainTag) {
    violations.push("document_structure_incomplete");
    score -= 35;
  }
  if (!hasHeaderTag) {
    violations.push("missing_header_landmark");
    score -= 6;
  }
  if (!hasBodyBackgroundClass || !hasBodyTextClass) {
    violations.push("missing_explicit_body_theme");
    score -= 8;
  }
  if (!hasFooterTag) {
    violations.push("missing_footer_landmark");
    score -= 6;
  }
  if (sectionCount < 3) {
    violations.push("insufficient_section_depth");
    score -= 10;
  }

  const hasHeroSignal =
    /<h1[\s>]/i.test(html) && /(text-5|text-6|text-7|py-20|py-24|py-28)/i.test(html);
  if (!hasHeroSignal) {
    violations.push("weak_hero_hierarchy");
    score -= 8;
  }

  const hasFeatureSignal =
    /(features?|benefits?|value|why choose)/i.test(html) &&
    /(grid-cols-|md:grid-cols-|lg:grid-cols-)/i.test(html);
  if (!hasFeatureSignal) {
    violations.push("weak_value_section");
    score -= 8;
  }

  const hasProofSignal =
    /(testimonial|customers|trusted|reviews|ratings|case study|proof|logos?|metrics?|stats?)/i.test(
      html,
    );
  if (!hasProofSignal) {
    violations.push("missing_social_proof_signal");
    score -= 8;
  }

  const hasCtaSignal =
    /(get started|start for free|book demo|try now|sign up|request demo|contact sales)/i.test(
      html,
    );
  if (!hasCtaSignal) {
    violations.push("missing_strong_cta_signal");
    score -= 10;
  }

  const hasHover = hasClassPattern(html, /\bhover:/i);
  const hasFocus = hasClassPattern(html, /\bfocus:/i) || hasClassPattern(html, /\bfocus-visible:/i);
  if (!hasHover || !hasFocus) {
    violations.push("insufficient_interaction_states");
    score -= 8;
  }

  const hasTypeScale =
    /(text-5|text-6|text-7)/i.test(html) &&
    /(text-lg|text-xl|text-base)/i.test(html);
  if (!hasTypeScale) {
    violations.push("weak_type_scale");
    score -= 6;
  }

  const spacingSignals = (html.match(/\b(p[xy]?|m[xy]?)-\d+/gi) ?? []).length;
  if (spacingSignals < 20) {
    violations.push("weak_spacing_rhythm");
    score -= 5;
  }

  if (/<style\b[\s\S]*?<\/style>/i.test(html)) {
    violations.push("style_tag_present");
    score -= 25;
  }
  if (/\sstyle\s*=\s*(".*?"|'.*?'|[^\s>]+)/i.test(html)) {
    violations.push("inline_style_present");
    score -= 25;
  }

  if (!allowImages && /<img\b/i.test(html)) {
    violations.push("image_present_without_permission");
    score -= 20;
  }

  const disallowedScriptTagMatches = html.match(/<script\b[^>]*>/gi) ?? [];
  const disallowedScriptCount = disallowedScriptTagMatches.filter((tag) => {
    const lowerTag = tag.toLowerCase();
    return (
      !lowerTag.includes("@tailwindcss/browser@4") &&
      !lowerTag.includes("@tailwindplus/elements@1")
    );
  }).length;
  if (disallowedScriptCount > 0) {
    violations.push("disallowed_script_detected");
    score -= 20;
  }

  const promptAllowsPurpleDark = /\b(purple|violet|magenta|dark|neon)\b/i.test(
    userPrompt,
  );
  const usesPurpleDarkDefault =
    /(from-(purple|violet|fuchsia)|to-(purple|violet|fuchsia)|bg-(purple|violet|fuchsia))/i.test(
      html,
    ) &&
    /(bg-(gray|slate|zinc|neutral)-9|text-(gray|slate|zinc|neutral)-[23]00)/i.test(
      html,
    );
  if (!promptAllowsPurpleDark && usesPurpleDarkDefault) {
    violations.push("generic_dark_purple_pattern");
    score -= 10;
  }

  const emojiCount = getEmojiCount(html);
  if (emojiCount >= 4) {
    violations.push("emoji_icon_overuse");
    score -= 8;
  }

  const repeatedCardPatternCount = (
    html.match(/rounded-2xl\s+shadow-xl/gi) ?? []
  ).length;
  if (repeatedCardPatternCount >= 4) {
    violations.push("repetitive_card_pattern");
    score -= 6;
  }

  if (/\bfont-sans\b/i.test(html) && !/<link[^>]+fonts\.googleapis\.com/i.test(html)) {
    violations.push("generic_typography_setup");
    score -= 8;
  }

  const finalScore = clampScore(score);
  const criticalViolations = violations.filter((violation) =>
    [
      "document_structure_incomplete",
      "style_tag_present",
      "inline_style_present",
      "disallowed_script_detected",
      "image_present_without_permission",
    ].includes(violation),
  );

  const isRenderable = hasHtmlTag && hasBodyTag;
  const needsRepair =
    !isRenderable || criticalViolations.length > 0 || finalScore < 78;

  return {
    score: finalScore,
    violations: Array.from(new Set(violations)),
    isRenderable,
    needsRepair,
  };
};
