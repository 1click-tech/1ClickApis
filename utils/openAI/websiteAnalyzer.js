const express = require("express");
const { db } = require("../../config/firebase");
const { checkAuth } = require("../../middlewares/authMiddleware");

const { sendEmail, generateOTP } = require("../../utils/email");
const moment = require("moment");
const axios = require("axios");

const router = express.Router();

const HTTP_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
};
const PAGESPEED_API_URL =
  "https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed";

const normalizeWebsiteUrl = (input) => {
  if (!input || typeof input !== "string") return null;

  let url = input.trim().toLowerCase();

  url = url.replace(/\/+$/, "");

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
};

const createAuditTemplate = (websiteUrl) => ({
  input: {
    website_url: websiteUrl,
    business_name: "na",
    audit_timestamp: "na"
  },
  website_audit: {
    page_speed: {
      mobile: {
        score: "na",
        raw_score: "na",
        score_out_of: 10,
        status: "na",
        metrics: {
          load_time: "na",
          lcp: "na",
          cls: "na",
          inp_fid: "na"
        },
        issues: [],
        ai_suggestions: []
      },
      desktop: {
        score: "na",
        raw_score: "na",
        score_out_of: 10,
        status: "na",
        metrics: {
          load_time: "na",
          lcp: "na",
          cls: "na",
          inp_fid: "na"
        },
        issues: [],
        ai_suggestions: []
      }
    },
    seo_report: {
      on_page_issues: {
        meta_title: [],
        meta_description: [],
        heading_structure: [],
        keyword_issues: [],
        image_alt_issues: [],
        internal_linking_issues: []
      },
      seo_score: "na",
      ai_fix_suggestions: []
    },
    technical_seo: {
      ssl_status: "missing",
      sitemap: "missing",
      robots_txt: "missing",
      broken_links_count: "na",
      mobile_friendly: "missing",
      indexing_issues: [],
      technical_score: "na",
      ai_suggestions: []
    },
    ui_ux_audit: {
      mobile_responsiveness: "na",
      cta_visibility: "na",
      readability: "na",
      navigation_clarity: "na",
      popup_issues: "na",
      ui_ux_score: "na",
      ai_feedback: []
    },
    final_website_score: {
      overall_score: "na",
      score_out_of: 10,
      breakdown: {
        speed: "na",
        seo: "na",
        technical: "na",
        ui_ux: "na"
      },
      issue_summary: "na",
      priority_action_plan: {
        high_priority: [],
        medium_priority: [],
        low_priority: []
      }
    }
  },
  social_media_audit: {
    platform_presence: {
      instagram: "na",
      facebook: "na",
      linkedin: "na",
      twitter_x: "na",
      youtube: "na"
    },
    profile_optimization: {
      bio_clarity: "na",
      cta_present: "na",
      link_in_bio: "na",
      issues: [],
      ai_suggested_bio: "na"
    },
    posting_frequency: {
      instagram: "na",
      facebook: "na",
      linkedin: "na",
      twitter_x: "na",
      youtube: "na"
    },
    engagement_analysis: {
      engagement_level: "na",
      common_issues: [],
      ai_insights: []
    },
    content_strategy_gap: {
      educational: "na",
      problem_solving: "na",
      trust_building: "na",
      sales_cta: "na",
      ai_suggestions: []
    },
    final_social_score: {
      score: "na",
      score_out_of: 100,
      breakdown: {
        profile_optimization: "na",
        consistency: "na",
        engagement: "na",
        content_quality: "na",
        platform_presence: "na"
      },
      priority_fixes: [],
      growth_plan_30_days: []
    }
  },
  gmb_audit: {
    verification_status: "na",
    duplicate_listing: "na",
    business_category: {
      primary: "na",
      secondary: [],
      category_accuracy: "na"
    },
    reviews_audit: {
      average_rating: "na",
      total_reviews: "na",
      review_freshness: "na",
      reply_ratio: "na"
    },
    photos_and_details: {
      total_photos: "na",
      cover_photo: "na",
      business_description: "na",
      working_hours: "na",
      contact_details: "na"
    },
    map_accuracy: {
      pin_accuracy: "na",
      nap_consistency: "na",
      service_area_defined: "na"
    },
    final_gmb_score: {
      score: "na",
      score_out_of: 100,
      breakdown: {
        verification: "na",
        category_accuracy: "na",
        reviews_trust: "na",
        profile_completeness: "na",
        map_accuracy: "na"
      },
      issue_summary: "na",
      ai_action_plan: []
    }
  },
  ai_readiness: {
    readiness_score: "na",
    status: "na",
    blocking_factors: [],
    improvement_steps: []
  },
  final_summary: {
    overall_business_health: "na",
    biggest_risks: [],
    biggest_opportunities: [],
    next_steps: [
      "fix_with_ai",
      "connect_with_expert",
      "schedule_appointment",
      "chat_with_ai_genie"
    ]
  }
});

const decodeHtmlEntities = (value = "") =>
  value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

const stripHtml = (value = "") =>
  decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();

const unique = (items) => [...new Set(items.filter(Boolean))];

const buildAbsoluteUrl = (baseUrl, rawUrl) => {
  if (!rawUrl || /^#|^mailto:|^tel:|^javascript:/i.test(rawUrl)) {
    return null;
  }

  try {
    return new URL(rawUrl, baseUrl).toString();
  } catch {
    return null;
  }
};

const getFirstMatch = (text, regex) => {
  const match = text.match(regex);
  return match?.[1] ? stripHtml(match[1]) : null;
};

const getMetaContent = (html, attribute, value) => {
  const patterns = [
    new RegExp(
      `<meta[^>]*${attribute}=["']${value}["'][^>]*content=["']([^"']*)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]*content=["']([^"']*)["'][^>]*${attribute}=["']${value}["'][^>]*>`,
      "i"
    )
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return stripHtml(match[1]);
  }

  return null;
};

const getTagTexts = (html, tagName, limit = 10) => {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  const matches = [];
  let match;

  while ((match = regex.exec(html)) !== null && matches.length < limit) {
    const text = stripHtml(match[1]);
    if (text) matches.push(text);
  }

  return matches;
};

const getAnchorData = (html, baseUrl) => {
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const anchors = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    anchors.push({
      href: buildAbsoluteUrl(baseUrl, match[1]),
      text: stripHtml(match[2])
    });
  }

  return anchors.filter((anchor) => anchor.href);
};

const getImageAltStats = (html) => {
  if (!html) {
    return {
      total_images: "na",
      images_missing_alt: "na"
    };
  }

  const images = html.match(/<img\b[\s\S]*?>/gi) || [];
  let missingAltCount = 0;

  for (const image of images) {
    const altMatch = image.match(/\balt=["']([^"']*)["']/i);
    if (!altMatch || !altMatch[1].trim()) {
      missingAltCount += 1;
    }
  }

  return {
    total_images: images.length,
    images_missing_alt: missingAltCount
  };
};

const fetchUrl = async (url) => {
  try {
    const response = await axios.get(url, {
      headers: HTTP_HEADERS,
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: () => true
    });

    return {
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      url: response.request?.res?.responseUrl || url,
      data: typeof response.data === "string" ? response.data : ""
    };
  } catch (error) {
    return {
      ok: false,
      status: "na",
      url,
      data: "",
      error: error.message
    };
  }
};

const getPageSpeedApiKey = () =>
  process.env.PAGESPEED_API_KEY ||
  process.env.GOOGLE_PAGESPEED_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  null;

const buildPageSpeedRequestUrl = (websiteUrl, strategy) => {
  const params = new URLSearchParams({
    url: websiteUrl,
    strategy,
    category: "performance",
    locale: "en_US"
  });

  const apiKey = getPageSpeedApiKey();
  if (apiKey) {
    params.set("key", apiKey);
  }

  return `${PAGESPEED_API_URL}?${params.toString()}`;
};

const mapPerformanceScoreToStatus = (score) => {
  if (typeof score !== "number") return "na";
  if (score >= 90) return "fast";
  if (score >= 50) return "moderate";
  return "slow";
};

const getAuditDisplayValue = (audits, auditIds) => {
  for (const auditId of auditIds) {
    const audit = audits?.[auditId];
    if (audit?.displayValue) return audit.displayValue;
  }

  return null;
};

const getCruxMetricValue = (report, metricKeys) => {
  const metricSources = [
    report?.loadingExperience?.metrics,
    report?.originLoadingExperience?.metrics
  ];

  for (const metrics of metricSources) {
    for (const metricKey of metricKeys) {
      const percentile = metrics?.[metricKey]?.percentile;
      if (typeof percentile === "number") {
        return percentile;
      }
    }
  }

  return null;
};

const formatMilliseconds = (value) => {
  if (typeof value !== "number") return "na";
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.round(value)} ms`;
};

const formatClsValue = (value) => {
  if (typeof value !== "number") return "na";
  return `${(value / 100).toFixed(2)}`;
};

const getAuditIssuesAndSuggestions = (audits = {}) => {
  const candidateAudits = Object.values(audits)
    .filter(
      (audit) =>
        audit &&
        typeof audit.score === "number" &&
        audit.score < 0.9 &&
        !["notApplicable", "manual", "informative", "error"].includes(
          audit.scoreDisplayMode
        )
    )
    .sort((a, b) => {
      const savingsA = a.details?.overallSavingsMs || 0;
      const savingsB = b.details?.overallSavingsMs || 0;
      return savingsB - savingsA || a.score - b.score;
    })
    .slice(0, 5);

  return {
    issues: candidateAudits.map((audit) =>
      audit.displayValue ? `${audit.title} (${audit.displayValue})` : audit.title
    ),
    ai_suggestions: unique(
      candidateAudits.map((audit) => stripHtml(audit.description || audit.title))
    )
  };
};

const normalizePageSpeedReport = (report, strategy) => {
  const lighthouseResult = report?.lighthouseResult || {};
  const audits = lighthouseResult.audits || {};
  const performanceScore = lighthouseResult.categories?.performance?.score;
  const rawScore =
    typeof performanceScore === "number"
      ? Math.round(performanceScore * 100)
      : "na";
  const score = normalizeTenPointScore(rawScore);
  const status =
    report?.loadingExperience?.overall_category &&
    report.loadingExperience.overall_category !== "NONE"
      ? {
          FAST: "fast",
          AVERAGE: "moderate",
          SLOW: "slow"
        }[report.loadingExperience.overall_category] ||
        mapPerformanceScoreToStatus(rawScore)
      : mapPerformanceScoreToStatus(rawScore);

  const inpPercentile = getCruxMetricValue(report, [
    "INTERACTION_TO_NEXT_PAINT",
    "FIRST_INPUT_DELAY_MS"
  ]);
  const clsPercentile = getCruxMetricValue(report, [
    "CUMULATIVE_LAYOUT_SHIFT_SCORE"
  ]);
  const { issues, ai_suggestions } = getAuditIssuesAndSuggestions(audits);

  return {
    strategy,
    score,
    raw_score: rawScore,
    score_out_of: 10,
    status,
    metrics: {
      load_time:
        getAuditDisplayValue(audits, ["speed-index", "interactive"]) || "na",
      lcp:
        getAuditDisplayValue(audits, ["largest-contentful-paint"]) ||
        formatMilliseconds(
          getCruxMetricValue(report, ["LARGEST_CONTENTFUL_PAINT_MS"])
        ) ||
        "na",
      cls:
        getAuditDisplayValue(audits, ["cumulative-layout-shift"]) ||
        formatClsValue(clsPercentile) ||
        "na",
      inp_fid:
        getAuditDisplayValue(audits, [
          "interaction-to-next-paint",
          "max-potential-fid"
        ]) ||
        formatMilliseconds(inpPercentile) ||
        "na"
    },
    issues,
    ai_suggestions
  };
};

const fetchPageSpeedInsight = async (websiteUrl, strategy) => {
  try {
    const requestUrl = buildPageSpeedRequestUrl(websiteUrl, strategy);

    const response = await axios.get(requestUrl, {
      headers: HTTP_HEADERS,
      timeout: 60000,
      validateStatus: () => true
    });

    if (response.status >= 200 && response.status < 300) {
      return normalizePageSpeedReport(response.data, strategy);
    }

    console.error("PageSpeed Insights API error:", {
      strategy,
      status: response.status,
      message: response.data?.error?.message || "Unknown PageSpeed API error",
      has_api_key: Boolean(getPageSpeedApiKey())
    });

    return {
      strategy,
      score: "na",
      status: "na",
      metrics: {
        load_time: "na",
        lcp: "na",
        cls: "na",
        inp_fid: "na"
      },
      issues: [],
      ai_suggestions: [],
      error: response.data?.error?.message || `PageSpeed status ${response.status}`
    };
  } catch (error) {
    console.error("PageSpeed Insights request failed:", {
      strategy,
      message: error.message,
      code: error.code || "na",
      has_api_key: Boolean(getPageSpeedApiKey())
    });

    return {
      strategy,
      score: "na",
      status: "na",
      metrics: {
        load_time: "na",
        lcp: "na",
        cls: "na",
        inp_fid: "na"
      },
      issues: [],
      ai_suggestions: [],
      error: error.message
    };
  }
};

const fetchPageSpeedEvidence = async (websiteUrl) => {
  const [mobile, desktop] = await Promise.all([
    fetchPageSpeedInsight(websiteUrl, "mobile"),
    fetchPageSpeedInsight(websiteUrl, "desktop")
  ]);

  console.log("PageSpeed summary:", {
    websiteUrl,
    mobile: {
      score: mobile.score,
      status: mobile.status,
      error: mobile.error || "na"
    },
    desktop: {
      score: desktop.score,
      status: desktop.status,
      error: desktop.error || "na"
    }
  });

  return { mobile, desktop };
};

const fetchWebsiteEvidence = async (websiteUrl) => {
  const home = await fetchUrl(websiteUrl);
  const finalUrl = home.url || websiteUrl;
  const origin = new URL(finalUrl).origin;
  const html = home.data || "";
  const hasHtmlEvidence = Boolean(html);
  const anchors = hasHtmlEvidence ? getAnchorData(html, finalUrl) : [];
  const sameHostLinks = anchors.filter((anchor) => {
    try {
      return new URL(anchor.href).hostname === new URL(finalUrl).hostname;
    } catch {
      return false;
    }
  });

  const socialProfiles = {};
  for (const anchor of anchors) {
    const href = anchor.href.toLowerCase();
    if (href.includes("instagram.com")) socialProfiles.instagram = anchor.href;
    if (href.includes("facebook.com")) socialProfiles.facebook = anchor.href;
    if (href.includes("linkedin.com")) socialProfiles.linkedin = anchor.href;
    if (href.includes("twitter.com") || href.includes("x.com")) {
      socialProfiles.twitter_x = anchor.href;
    }
    if (href.includes("youtube.com") || href.includes("youtu.be")) {
      socialProfiles.youtube = anchor.href;
    }
  }

  const ctaRegex =
    /\b(contact|call|book|quote|get started|get in touch|schedule|start|buy|demo|consultation)\b/i;
  const ctaTexts = unique(
    [
      ...anchors.map((anchor) => anchor.text),
      ...getTagTexts(html, "button", 20)
    ]
      .map((text) => text.trim())
      .filter((text) => ctaRegex.test(text))
  ).slice(0, 10);

  const robots = await fetchUrl(`${origin}/robots.txt`);

  let sitemapUrl = null;
  if (robots.ok) {
    const sitemapMatch = robots.data.match(/^sitemap:\s*(.+)$/im);
    sitemapUrl = sitemapMatch?.[1]?.trim() || null;
  }

  const sitemap = await fetchUrl(sitemapUrl || `${origin}/sitemap.xml`);

  return {
    website_url: websiteUrl,
    fetch_status: home.status,
    final_url: finalUrl,
    https_enabled: finalUrl.startsWith("https://"),
    title: getFirstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || "na",
    meta_description:
      getMetaContent(html, "name", "description") ||
      getMetaContent(html, "property", "og:description") ||
      "na",
    canonical_url:
      getFirstMatch(
        html,
        /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i
      ) || "na",
    viewport_meta_present: hasHtmlEvidence
      ? /<meta[^>]*name=["']viewport["']/i.test(html)
      : "na",
    language:
      getFirstMatch(html, /<html[^>]*lang=["']([^"']+)["'][^>]*>/i) || "na",
    h1_tags: getTagTexts(html, "h1", 5),
    h2_tags: getTagTexts(html, "h2", 10),
    internal_link_count: hasHtmlEvidence ? sameHostLinks.length : "na",
    important_page_hints: {
      about_page_linked: hasHtmlEvidence
        ? sameHostLinks.some(
            (anchor) => /about/i.test(anchor.href) || /about/i.test(anchor.text)
          )
        : "na",
      contact_page_linked: hasHtmlEvidence
        ? sameHostLinks.some(
            (anchor) =>
              /contact/i.test(anchor.href) || /contact/i.test(anchor.text)
          )
        : "na",
      services_page_linked: hasHtmlEvidence
        ? sameHostLinks.some(
            (anchor) =>
              /service/i.test(anchor.href) || /service/i.test(anchor.text)
          )
        : "na"
    },
    image_alt_stats: getImageAltStats(html),
    social_profile_links: socialProfiles,
    cta_texts: ctaTexts,
    body_text_sample: hasHtmlEvidence ? stripHtml(html).slice(0, 600) : "na",
    robots_txt: robots.ok ? "present" : "missing",
    robots_txt_url: robots.ok ? robots.url : "na",
    sitemap: sitemap.ok ? "present" : "missing",
    sitemap_url: sitemap.ok ? sitemap.url : "na",
    fetch_error: home.error || "na"
  };
};

const extractTextFromResponse = (resp) => {
  if (resp.data.output_text) return resp.data.output_text;

  if (!Array.isArray(resp.data.output)) return null;

  let text = "";

  for (const item of resp.data.output) {
    if (item.type === "message") {
      for (const content of item.content || []) {
        if (content.type === "output_text") {
          text += content.text;
        }
      }
    }
  }

  return text || null;
};

const extractJsonObject = (rawText) => {
  if (!rawText || typeof rawText !== "string") {
    throw new Error("Model did not return JSON text");
  }

  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");
  const candidates = [
    rawText.trim(),
    rawText.match(/```json\s*([\s\S]*?)```/i)?.[1],
    rawText.match(/```([\s\S]*?)```/i)?.[1],
    firstBrace >= 0 && lastBrace > firstBrace
      ? rawText.slice(firstBrace, lastBrace + 1)
      : null
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error("Model returned invalid JSON");
};

const mergeWithTemplate = (template, value) => {
  if (Array.isArray(template)) {
    return Array.isArray(value)
      ? value.filter((item) => item !== undefined)
      : template;
  }

  if (template && typeof template === "object") {
    const result = {};
    const source = value && typeof value === "object" ? value : {};

    for (const key of Object.keys(template)) {
      result[key] = mergeWithTemplate(template[key], source[key]);
    }

    return result;
  }

  if (value === undefined || value === null || value === "") {
    return template;
  }

  return value;
};

const sanitizeNaValues = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeNaValues(item));
  }

  if (value && typeof value === "object") {
    const result = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      result[key] = sanitizeNaValues(nestedValue);
    }

    return result;
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  const naLikeValues = new Set([
    "",
    "n/a",
    "na",
    "nan",
    "null",
    "undefined",
    "not available",
    "unavailable",
    "unknown",
    "unable to verify",
    "cannot verify"
  ]);

  if (naLikeValues.has(normalized)) {
    return "na";
  }

  if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
    const numericValue = Number(trimmed);
    return Number.isFinite(numericValue) ? numericValue : "na";
  }

  return value;
};

const isNumericScore = (value) =>
  typeof value === "number" && Number.isFinite(value);

const clampScore = (value, min = 0, max = 10) => {
  if (!isNumericScore(value)) return "na";
  return Math.max(min, Math.min(max, value));
};

const normalizeTenPointScore = (value, decimals = 1) => {
  if (!isNumericScore(value)) return "na";

  const normalizedValue =
    value <= 10 ? value : value <= 100 ? value / 10 : (value / 100) * 10;

  return clampScore(Number(normalizedValue.toFixed(decimals)));
};

const averageScores = (scores, decimals = 1) => {
  const validScores = scores.filter((score) => isNumericScore(score));
  if (!validScores.length) return "na";

  const average =
    validScores.reduce((sum, score) => sum + score, 0) / validScores.length;

  return Number(average.toFixed(decimals));
};

const inferBusinessName = (evidence) => {
  if (!evidence) return "na";

  if (typeof evidence.title === "string" && evidence.title !== "na") {
    const cleaned = evidence.title.split("|")[0].split("-")[0].trim();
    if (cleaned) return cleaned;
  }

  try {
    const hostname = new URL(evidence.final_url || evidence.website_url).hostname;
    return hostname.replace(/^www\./i, "");
  } catch {
    return "na";
  }
};

const computeSeoEvidenceScore = (evidence) => {
  if (!evidence) return "na";

  let points = 0;
  let checks = 0;

  checks += 1;
  if (typeof evidence.title === "string" && evidence.title !== "na") points += 1;

  checks += 1;
  if (
    typeof evidence.meta_description === "string" &&
    evidence.meta_description !== "na"
  ) {
    points += 1;
  }

  checks += 1;
  if (Array.isArray(evidence.h1_tags) && evidence.h1_tags.length > 0) points += 1;

  checks += 1;
  if (Array.isArray(evidence.h2_tags) && evidence.h2_tags.length > 0) points += 1;

  checks += 1;
  if (
    isNumericScore(evidence.image_alt_stats?.total_images) &&
    isNumericScore(evidence.image_alt_stats?.images_missing_alt)
  ) {
    const total = evidence.image_alt_stats.total_images;
    const missing = evidence.image_alt_stats.images_missing_alt;
    if (total === 0 || missing / total <= 0.3) points += 1;
  }

  checks += 1;
  if (isNumericScore(evidence.internal_link_count) && evidence.internal_link_count > 0) {
    points += 1;
  }

  if (!checks) return "na";
  return clampScore(Number(((points / checks) * 10).toFixed(1)));
};

const computeTechnicalEvidenceScore = (evidence) => {
  if (!evidence) return "na";

  let points = 0;
  let checks = 0;

  checks += 1;
  if (evidence.https_enabled === true) points += 1;

  checks += 1;
  if (evidence.robots_txt === "present") points += 1;

  checks += 1;
  if (evidence.sitemap === "present") points += 1;

  checks += 1;
  if (evidence.viewport_meta_present === true) points += 1;

  if (!checks) return "na";
  return clampScore(Number(((points / checks) * 10).toFixed(1)));
};

const computeUiUxEvidenceScore = (evidence) => {
  if (!evidence) return "na";

  let points = 0;
  let checks = 0;

  checks += 1;
  if (evidence.viewport_meta_present === true) points += 1;

  checks += 1;
  if (Array.isArray(evidence.cta_texts) && evidence.cta_texts.length > 0) points += 1;

  checks += 1;
  if (
    evidence.important_page_hints?.about_page_linked === true ||
    evidence.important_page_hints?.contact_page_linked === true
  ) {
    points += 1;
  }

  checks += 1;
  if (
    typeof evidence.body_text_sample === "string" &&
    evidence.body_text_sample !== "na" &&
    evidence.body_text_sample.length >= 150
  ) {
    points += 1;
  }

  if (!checks) return "na";
  return clampScore(Number(((points / checks) * 10).toFixed(1)));
};

const applyUiUxEvidence = (merged, evidence) => {
  const uiUxAudit = merged.website_audit?.ui_ux_audit;

  if (!uiUxAudit || !evidence) {
    return merged;
  }

  if (uiUxAudit.mobile_responsiveness === "na") {
    uiUxAudit.mobile_responsiveness =
      evidence.viewport_meta_present === true
        ? "responsive"
        : evidence.viewport_meta_present === false
        ? "not responsive"
        : "na";
  }

  if (uiUxAudit.cta_visibility === "na") {
    uiUxAudit.cta_visibility =
      Array.isArray(evidence.cta_texts) && evidence.cta_texts.length > 0
        ? "visible"
        : "not found";
  }

  if (uiUxAudit.readability === "na") {
    uiUxAudit.readability =
      typeof evidence.body_text_sample === "string" &&
      evidence.body_text_sample !== "na" &&
      evidence.body_text_sample.length >= 150
        ? "good"
        : typeof evidence.body_text_sample === "string" &&
          evidence.body_text_sample !== "na"
        ? "needs improvement"
        : "na";
  }

  if (uiUxAudit.navigation_clarity === "na") {
    uiUxAudit.navigation_clarity =
      evidence.important_page_hints?.about_page_linked === true ||
      evidence.important_page_hints?.contact_page_linked === true ||
      evidence.important_page_hints?.services_page_linked === true
        ? "clear"
        : "needs improvement";
  }

  if (uiUxAudit.popup_issues === "na") {
    uiUxAudit.popup_issues = "na";
  }

  return merged;
};

const applyComputedWebsiteScores = (merged, evidence) => {
  const websiteAudit = merged.website_audit;
  if (!websiteAudit) return merged;

  const mobileSpeedScore = normalizeTenPointScore(
    websiteAudit.page_speed?.mobile?.score
  );
  const desktopSpeedScore = normalizeTenPointScore(
    websiteAudit.page_speed?.desktop?.score
  );
  const speedScore10 = averageScores([mobileSpeedScore, desktopSpeedScore], 1);

  if (!isNumericScore(websiteAudit.seo_report?.seo_score)) {
    websiteAudit.seo_report.seo_score = computeSeoEvidenceScore(evidence);
  }

  if (!isNumericScore(websiteAudit.technical_seo?.technical_score)) {
    websiteAudit.technical_seo.technical_score = computeTechnicalEvidenceScore(evidence);
  }

  if (!isNumericScore(websiteAudit.ui_ux_audit?.ui_ux_score)) {
    websiteAudit.ui_ux_audit.ui_ux_score = computeUiUxEvidenceScore(evidence);
  }

  websiteAudit.final_website_score.breakdown = {
    speed: speedScore10,
    seo: websiteAudit.seo_report?.seo_score ?? "na",
    technical: websiteAudit.technical_seo?.technical_score ?? "na",
    ui_ux: websiteAudit.ui_ux_audit?.ui_ux_score ?? "na"
  };

  const overallScore = averageScores(
    Object.values(websiteAudit.final_website_score.breakdown),
    1
  );

  websiteAudit.final_website_score.overall_score = overallScore;

  if (!isNumericScore(merged.ai_readiness?.readiness_score)) {
    merged.ai_readiness.readiness_score = overallScore;
  }

  if (merged.ai_readiness?.status === "na") {
    merged.ai_readiness.status =
      overallScore === "na"
        ? "na"
        : overallScore >= 8
        ? "high"
        : overallScore >= 5
        ? "moderate"
        : "low";
  }

  if (merged.final_summary?.overall_business_health === "na") {
    merged.final_summary.overall_business_health =
      overallScore === "na"
        ? "na"
        : overallScore >= 8
        ? "strong"
        : overallScore >= 5
        ? "average"
        : "weak";
  }

  if (
    websiteAudit.final_website_score.issue_summary === "na" &&
    Array.isArray(websiteAudit.technical_seo?.indexing_issues) &&
    websiteAudit.technical_seo.indexing_issues.length
  ) {
    websiteAudit.final_website_score.issue_summary =
      websiteAudit.technical_seo.indexing_issues.join(", ");
  }

  return merged;
};

const applyTechnicalSeoEvidence = (merged, evidence) => {
  const technicalSeo = merged.website_audit?.technical_seo;

  if (!technicalSeo || !evidence) {
    return merged;
  }

  technicalSeo.ssl_status = evidence.https_enabled === true ? "valid" : "missing";
  technicalSeo.robots_txt = evidence.robots_txt === "present" ? "present" : "missing";
  technicalSeo.sitemap = evidence.sitemap === "present" ? "present" : "missing";

  if (evidence.viewport_meta_present === true) {
    technicalSeo.mobile_friendly = "yes";
  } else if (evidence.viewport_meta_present === false) {
    technicalSeo.mobile_friendly = "missing";
  } else if (technicalSeo.mobile_friendly === "na") {
    technicalSeo.mobile_friendly = "missing";
  }

  const indexingIssues = [];
  if (technicalSeo.robots_txt === "missing") {
    indexingIssues.push("robots.txt not found");
  }
  if (technicalSeo.sitemap === "missing") {
    indexingIssues.push("sitemap not found");
  }
  if (technicalSeo.ssl_status === "missing") {
    indexingIssues.push("https not enabled");
  }

  if (!technicalSeo.indexing_issues.length) {
    technicalSeo.indexing_issues = indexingIssues;
  }

  return merged;
};

const applyPageSpeedEvidence = (merged, pageSpeedInsights) => {
  const pageSpeed = merged.website_audit?.page_speed;

  if (!pageSpeed || !pageSpeedInsights) {
    return merged;
  }

  for (const strategy of ["mobile", "desktop"]) {
    const report = pageSpeedInsights[strategy];
    if (!report) continue;

    pageSpeed[strategy] = {
      ...pageSpeed[strategy],
      score: normalizeTenPointScore(report.score),
      raw_score: report.raw_score ?? "na",
      score_out_of: report.score_out_of ?? 10,
      status: report.status,
      metrics: {
        load_time: report.metrics?.load_time || "na",
        lcp: report.metrics?.lcp || "na",
        cls: report.metrics?.cls || "na",
        inp_fid: report.metrics?.inp_fid || "na"
      },
      issues: Array.isArray(report.issues) ? report.issues : [],
      ai_suggestions: Array.isArray(report.ai_suggestions)
        ? report.ai_suggestions
        : []
    };
  }

  return merged;
};

const normalizeAuditPayload = (payload, websiteUrl, evidence) => {
  const template = createAuditTemplate(websiteUrl);
  const merged = applyComputedWebsiteScores(
    applyPageSpeedEvidence(
      applyUiUxEvidence(
        applyTechnicalSeoEvidence(
          sanitizeNaValues(mergeWithTemplate(template, payload)),
          evidence
        ),
        evidence
      ),
      evidence?.page_speed_insights
    ),
    evidence
  );

  merged.input.website_url = websiteUrl;
  merged.input.audit_timestamp = moment().toISOString();
  if (merged.input.business_name === "na") {
    merged.input.business_name = inferBusinessName(evidence);
  }

  return merged;
};

const buildAuditPrompts = (websiteUrl, evidence) => {
  const responseShape = createAuditTemplate(websiteUrl);

  const systemPrompt = `
You are an evidence-only website audit agent.

Rules you must follow:
- Use ONLY the provided evidence.
- Never guess, estimate, simulate, or invent facts.
- If a value is not directly supported by evidence, return "na".
- Do not use placeholder defaults like 0, false, true, "good", "missing", or "active" unless you can verify them.
- If page_speed_insights is present in evidence, use those values as the source of truth for page speed fields.
- For presence checks such as sitemap, robots_txt, and ssl_status, use "missing" when the item is not found.
- For scores, return a number only if there is enough evidence to justify it. Otherwise return "na".
- For booleans, return true or false only if directly verified. Otherwise return "na".
- For arrays, return [] if there are no verified items.
- Performance metrics such as load_time, lcp, cls, and inp_fid should be "na" unless directly available from evidence.
- broken_links_count must be "na" unless links were directly tested.
- If social media or Google Business Profile cannot be verified from evidence or public results, keep their fields as "na".
- Keep arrays concise. Prefer at most 3 to 5 items per array unless the evidence clearly requires more.
- Output valid JSON only. No markdown. No commentary. No extra keys.

Return exactly this JSON shape:
${JSON.stringify(responseShape)}
`.trim();

  const userPrompt = `
Analyze this website URL: ${websiteUrl}

Provided evidence:
${JSON.stringify(evidence, null, 2)}

Focus on accurate, non-hallucinated output. If something is unavailable or uncertain, set it to "na".
`.trim();

  return { systemPrompt, userPrompt };
};

const isRetryableOpenAiError = (error) => {
  const retryableCodes = new Set(["ECONNRESET", "ETIMEDOUT", "ECONNABORTED"]);
  const message = `${error?.message || ""}`.toLowerCase();

  return (
    retryableCodes.has(error?.code) ||
    message.includes("socket hang up") ||
    message.includes("timeout")
  );
};

const shouldRetryWithoutWebSearch = (error) => {
  const message = `${error?.message || ""}`.toLowerCase();
  const apiMessage = `${
    error?.response?.data?.error?.message || ""
  }`.toLowerCase();

  return (
    isRetryableOpenAiError(error) ||
    message.includes("model returned invalid json") ||
    apiMessage.includes("web search cannot be used with json mode")
  );
};

const fetchWebSearchEvidence = async (websiteUrl) => {
  try {
    const resp = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-5-mini",
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "Use web search to collect only publicly verifiable audit evidence for the provided website. Return concise plain text only. Do not output JSON. Focus on public social links, business profile hints, and any public facts that are directly relevant to a website audit. If nothing reliable is found, return 'na'."
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Collect web-search evidence for this website: ${websiteUrl}`
              }
            ]
          }
        ],
        tools: [{ type: "web_search_preview" }],
        max_output_tokens: 1200
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 45000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }
    );

    return extractTextFromResponse(resp) || "na";
  } catch (error) {
    console.error("Web search evidence fetch failed:", {
      message: error.message,
      code: error.code || "na",
      status: error.response?.status || "na",
      data: error.response?.data || "na"
    });

    return "na";
  }
};

const requestSeoAuditFromOpenAI = async ({ websiteUrl, evidence }) => {
  const { systemPrompt, userPrompt } = buildAuditPrompts(websiteUrl, evidence);
  const payload = {
    model: "gpt-5-mini",
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    text: {
      format: {
        type: "json_object"
      }
    },
    max_output_tokens: 6000
  };

  const resp = await axios.post(
    "https://api.openai.com/v1/responses",
    payload,
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 45000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    }
  );

  const outputText = extractTextFromResponse(resp);

  if (!outputText) {
    throw new Error("No text output returned by model");
  }

  return normalizeAuditPayload(extractJsonObject(outputText), websiteUrl, evidence);
};

const seoWebsiteAuditJSON = async (websiteUrl) => {
  const [websiteEvidence, pageSpeedInsights, webSearchSummary] = await Promise.all([
    fetchWebsiteEvidence(websiteUrl),
    fetchPageSpeedEvidence(websiteUrl),
    fetchWebSearchEvidence(websiteUrl)
  ]);
  const evidence = {
    ...websiteEvidence,
    page_speed_insights: pageSpeedInsights,
    web_search_summary: webSearchSummary
  };

  try {
    return await requestSeoAuditFromOpenAI({ websiteUrl, evidence });
  } catch (error) {
    if (!shouldRetryWithoutWebSearch(error)) {
      throw error;
    }

    console.error(
      "SEO audit primary OpenAI request failed, retrying with local evidence only:",
      error.message
    );

    const fallbackEvidence = {
      ...evidence,
      web_search_summary: "na"
    };

    return requestSeoAuditFromOpenAI({
      websiteUrl,
      evidence: fallbackEvidence
    });
  }
};

const runSeoAudit = async (req, res) => {
  try {
    const website = normalizeWebsiteUrl(req.body.website);
    console.log("Running SEO audit for:", website);

    if (!website) {
      return res.status(400).json({
        success: false,
        message: "Valid website URL is required"
      });
    }

    const auditResult = await seoWebsiteAuditJSON(website);

    return res.status(200).json({
      success: true,
      data: auditResult
    });
  } catch (error) {
    console.error("SEO Audit Error:", {
      message: error.message,
      code: error.code || "na",
      status: error.response?.status || "na",
      data: error.response?.data || "na"
    });

    return res.status(500).json({
      success: false,
      message: "Failed to run SEO audit",
      error: error.response?.data?.error?.message || error.message
    });
  }
};

router.post("/runSeoAudit", runSeoAudit);

module.exports = { websiteAnalyzer: router };
