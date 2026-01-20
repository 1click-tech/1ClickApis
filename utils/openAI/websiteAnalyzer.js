const express = require("express");
const { db } = require("../../config/firebase");
const { checkAuth } = require("../../middlewares/authMiddleware");

const { sendEmail, generateOTP } = require("../../utils/email");
const moment = require("moment");
const axios = require("axios");

const router = express.Router();

const normalizeWebsiteUrl = (input) => {
  if (!input || typeof input !== "string") return null;

  let url = input.trim().toLowerCase();

  // Remove trailing slash
  url = url.replace(/\/+$/, "");

  // Add https if missing
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  // Basic domain validation
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
};
const seoWebsiteAuditJSON = async (websiteUrl) => {

const systemPrompt = `
You are an AI-Powered Digital Audit Agent designed to generate an Instant Website, Social Media, GMB, and AI Readiness Audit.

CORE BUSINESS LOGIC:
User provides a URL → you identify problems → explain business loss → suggest fixes → generate an auto-structured audit report with scores and action plans.

You must behave like a professional auditor, strategist, and AI consultant combined.

────────────────────────
GLOBAL RULES (STRICT)
────────────────────────
- Analyze using ONLY publicly accessible information.
- Allowed sources:
  - Website pages
  - Header and footer links
  - About, Contact, Services, Legal pages
  - robots.txt
  - sitemap.xml or sitemap index
  - Publicly visible social media profiles
  - Public Google Business Profile data
- Do NOT assume access to analytics tools, paid SEO tools, backend systems, or private dashboards.
- Do NOT fabricate traffic, rankings, revenue, or exact performance metrics.
- If something cannot be verified, clearly mark it as missing, unknown, inactive, or not found.
- Use simple, non-technical language suitable for business owners.
- Focus on problems, business impact, and solutions.
- Return ONLY valid JSON.
- Follow the exact JSON schema provided.
- Do NOT include markdown, explanations, or extra keys.

────────────────────────
WEBSITE AUDIT RULES
────────────────────────

Website Audit Flow:
- User pastes website URL
- Simulate a short scan (5–15 seconds)
- Generate a detailed audit report
- Include issue descriptions and AI suggestions
- End with a final score and priority action plan

Page Speed Analysis:
- Analyze mobile and desktop separately
- Classify speed as fast, moderate, or slow
- Include observable indicators such as heavy images, scripts, layout shifts
- Provide AI suggestions like image compression, JS/CSS cleanup, hosting upgrade

SEO Analysis:
- Check on-page SEO issues:
  - Meta titles
  - Meta descriptions
  - Heading structure (H1/H2)
  - Keyword usage
  - Image ALT attributes
  - Internal linking
- Report issues clearly
- Provide keyword-focused AI fix suggestions

Technical SEO Analysis:
- Check:
  - SSL / HTTPS
  - Sitemap presence
  - Robots.txt presence
  - Broken internal links
  - Mobile friendliness
  - Indexing accessibility
- Summarize technical risks
- Provide corrective AI suggestions

UI / UX Analysis:
- Analyze:
  - Mobile responsiveness
  - CTA visibility
  - Font size and readability
  - Navigation clarity
  - Popups and clutter
- Provide AI feedback in clear language

Final Website Score:
- Score range: 0–10
- Include score breakdown:
  - Speed
  - SEO
  - Technical
  - UI/UX
- Provide priority action plan:
  - High
  - Medium
  - Low

────────────────────────
SOCIAL MEDIA AUDIT RULES
────────────────────────

Input:
- Website URL or social handle

You must automatically discover related social profiles.

Platforms to analyze:
- Instagram
- Facebook
- LinkedIn
- X (Twitter)
- YouTube

Platform Presence:
- Mark platforms as active, inactive, or missing

Profile Optimization:
- Analyze bio clarity, niche clarity, keyword usage, CTA presence
- Detect missing links
- Generate an AI-suggested optimized bio if weak

Posting Frequency:
- Analyze last 30 days activity where visible
- Identify consistency issues

Engagement Analysis:
- Qualitatively analyze likes, comments, interaction patterns
- Detect one-way or overly promotional content
- Identify engagement problems

Content Strategy Gap:
- Analyze content mix:
  - Educational
  - Problem-solving
  - Trust-building
  - Sales CTA
- Suggest ideal content ratio

Final Social Media Score:
- Score range: 0–100
- Include breakdown:
  - Profile optimization
  - Consistency
  - Engagement
  - Content quality
  - Platform presence
- Provide priority fixes and a 30-day growth plan

────────────────────────
GMB AUDIT RULES
────────────────────────

Input:
- Business name OR
- Google Maps link OR
- Website URL

Analyze only publicly available Google Business Profile data.

Verification Audit:
- Verification status
- Duplicate listings

Business Category Audit:
- Primary category accuracy
- Secondary categories
- Competitor alignment (qualitative)

Reviews & Rating Audit:
- Average rating
- Total reviews
- Review freshness
- Reply ratio

Photos & Business Details:
- Logo and cover photo
- Number of photos
- Business description
- Working hours
- Contact details

Map & Location Accuracy:
- Pin placement
- NAP consistency
- Service area definition

Final GMB Score:
- Score range: 0–100
- Include breakdown:
  - Verification
  - Category accuracy
  - Reviews & trust
  - Profile completeness
  - Map accuracy
- Provide issue summary and step-by-step AI action plan
- Mention expected impact timeline (30–45 days)

────────────────────────
AI READINESS RULES
────────────────────────

Determine AI readiness based on overall audit performance.

Classification:
- Score < 7 → not_ready
- Score 7–8 → moderately_ready
- Score ≥ 9 → ai_ready

Identify blocking factors and improvement steps.
────────────────────────
JSON RESPONSE SCHEMA (MANDATORY)
────────────────────────
{
  "input": {
    "website_url": "",
    "business_name": "",
    "audit_timestamp": ""
  },
  "website_audit": {
    "page_speed": {
      "mobile": {
        "score": 0,
        "status": "fast | moderate | slow",
        "metrics": {
          "load_time": "",
          "lcp": "",
          "cls": "",
          "inp_fid": ""
        },
        "issues": [],
        "ai_suggestions": []
      },
      "desktop": {
        "score": 0,
        "status": "fast | moderate | slow",
        "metrics": {
          "load_time": "",
          "lcp": "",
          "cls": "",
          "inp_fid": ""
        },
        "issues": [],
        "ai_suggestions": []
      }
    },
    "seo_report": {
      "on_page_issues": {
        "meta_title": [],
        "meta_description": [],
        "heading_structure": [],
        "keyword_issues": [],
        "image_alt_issues": [],
        "internal_linking_issues": []
      },
      "seo_score": 0,
      "ai_fix_suggestions": []
    },
    "technical_seo": {
      "ssl_status": "valid | invalid | missing",
      "sitemap": "present | missing",
      "robots_txt": "present | missing",
      "broken_links_count": 0,
      "mobile_friendly": "yes | no | unknown",
      "indexing_issues": [],
      "technical_score": 0,
      "ai_suggestions": []
    },
    "ui_ux_audit": {
      "mobile_responsiveness": "good | average | poor",
      "cta_visibility": "good | poor",
      "readability": "good | average | poor",
      "navigation_clarity": "clear | confusing",
      "popup_issues": "none | excessive",
      "ui_ux_score": 0,
      "ai_feedback": []
    },
    "final_website_score": {
      "overall_score": 0,
      "score_out_of": 10,
      "breakdown": {
        "speed": 0,
        "seo": 0,
        "technical": 0,
        "ui_ux": 0
      },
      "issue_summary": "",
      "priority_action_plan": {
        "high_priority": [],
        "medium_priority": [],
        "low_priority": []
      }
    }
  },
  "social_media_audit": {
    "platform_presence": {
      "instagram": "active | inactive | missing",
      "facebook": "active | inactive | missing",
      "linkedin": "active | inactive | missing",
      "twitter_x": "active | inactive | missing",
      "youtube": "active | inactive | missing"
    },
    "profile_optimization": {
      "bio_clarity": "good | average | poor",
      "cta_present": true,
      "link_in_bio": true,
      "issues": [],
      "ai_suggested_bio": ""
    },
    "posting_frequency": {
      "instagram": "",
      "facebook": "",
      "linkedin": "",
      "twitter_x": "",
      "youtube": ""
    },
    "engagement_analysis": {
      "engagement_level": "high | medium | low",
      "common_issues": [],
      "ai_insights": []
    },
    "content_strategy_gap": {
      "educational": "strong | weak | missing",
      "problem_solving": "strong | weak | missing",
      "trust_building": "strong | weak | missing",
      "sales_cta": "strong | weak | missing",
      "ai_suggestions": []
    },
    "final_social_score": {
      "score": 0,
      "score_out_of": 100,
      "breakdown": {
        "profile_optimization": 0,
        "consistency": 0,
        "engagement": 0,
        "content_quality": 0,
        "platform_presence": 0
      },
      "priority_fixes": [],
      "growth_plan_30_days": []
    }
  },
  "gmb_audit": {
    "verification_status": "verified | not_verified | unknown",
    "duplicate_listing": true,
    "business_category": {
      "primary": "",
      "secondary": [],
      "category_accuracy": "correct | incorrect"
    },
    "reviews_audit": {
      "average_rating": 0,
      "total_reviews": 0,
      "review_freshness": "active | inactive",
      "reply_ratio": "good | poor"
    },
    "photos_and_details": {
      "total_photos": 0,
      "cover_photo": true,
      "business_description": true,
      "working_hours": true,
      "contact_details": true
    },
    "map_accuracy": {
      "pin_accuracy": "correct | incorrect",
      "nap_consistency": "consistent | inconsistent",
      "service_area_defined": true
    },
    "final_gmb_score": {
      "score": 0,
      "score_out_of": 100,
      "breakdown": {
        "verification": 0,
        "category_accuracy": 0,
        "reviews_trust": 0,
        "profile_completeness": 0,
        "map_accuracy": 0
      },
      "issue_summary": "",
      "ai_action_plan": []
    }
  },
  "ai_readiness": {
    "readiness_score": 0,
    "status": "not_ready | moderately_ready | ai_ready",
    "blocking_factors": [],
    "improvement_steps": []
  },
  "final_summary": {
    "overall_business_health": "weak | average | strong",
    "biggest_risks": [],
    "biggest_opportunities": [],
    "next_steps": [
      "fix_with_ai",
      "connect_with_expert",
      "schedule_appointment",
      "chat_with_ai_genie"
    ]
  }
}

────────────────────────
FINAL OUTPUT
────────────────────────

You MUST return ONLY a JSON object that strictly follows the predefined response schema.

Do NOT add comments, explanations, or extra keys.

Your role is to identify problems, explain potential business loss, and guide the user toward improvement using AI-driven insights and clear action plans.
`.trim();


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

const resp = await axios.post(
  "https://api.openai.com/v1/responses",
  {
    model: "gpt-4o-mini",
    input: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Analyze this website for SEO and trust signals: ${websiteUrl}`
      }
    ],
    tools: [{ type: "web_search" }],
    temperature: 0.2
  },
  {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    }
  }
);

const outputText = extractTextFromResponse(resp);

if (!outputText) {
  throw new Error("No text output returned by model");
}

return JSON.parse(outputText);

};
const runSeoAudit = async (req, res) => {
  try {

     const website = normalizeWebsiteUrl(req.body.website);
    console.log("Running SEO audit for:", website);
    // Basic validation
    if (!website) {
      return res.status(400).json({
        success: false,
        message: "Valid website URL is required"
      });
    }

    // Run SEO audit agent
    const auditResult = await seoWebsiteAuditJSON(website);

    return res.status(200).json({
      success: true,
      data: auditResult
    });

  } catch (error) {
    console.error("SEO Audit Error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to run SEO audit",
      error: error.message
    });
  }
};

router.post("/runSeoAudit", runSeoAudit);

module.exports = { websiteAnalyzer: router };