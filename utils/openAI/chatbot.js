
const express = require("express");
const router = express.Router();

const axios = require("axios");
const { kbPath } = require("../../utils/openAI/kb.json");
/**
 * Chatbot API Controller
 */

const chatbot = async (req, res) => {
  try {
    const { text } = req.body;
    console.log("Chatbot request text:", text);
    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    const SYSTEM_PROMPT = `
You are a knowledgeable business support and pre-sales assistant for 1ClickDistributors.

Your task:
- Understand the user’s question or business problem.
- Answer by EXTRACTING and SUMMARIZING information from the provided knowledge base.
- Clearly explain what 1ClickDistributors does and how its services can help solve the user’s problem.

Strict rules:
- You may rephrase and combine information, but you MUST NOT invent new services, features, pricing, guarantees, or processes.
- give messages a friendly and professional tone.
// - it should be short and concise, ideally under 150 words.

Response guidelines:
- Be clear, professional, and business-friendly.
- Prefer structured explanations (short paragraphs or bullet points).
- Focus on solutions and outcomes.

`.trim();

    const resp = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-4o-mini",
        input: [
          {
            role: "system",
            content: SYSTEM_PROMPT
          },
          {
            role: "user",
            content: JSON.stringify({
              knowledgeBase: kbPath, // ✅ full KB
              question: text
            })
          }
        ],
        temperature: 0,
        max_output_tokens: 300
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );

    /**
     * Simple text extraction (no schema)
     */
    const answer =
      resp.data?.output?.[0]?.content?.find(
        block => block.type === "output_text"
      )?.text;

    if (!answer) {
      throw new Error("No text output from AI");
    }

    console.log("Chatbot answer:", answer);

    return res.json({ answer });

  } catch (error) {
    console.error(
      "Chatbot error:",
      error?.response?.data || error.message
    );

    return res.status(500).json({
      error: "AI processing failed"
    });
  }
};




router.post("/chatbot", chatbot);


module.exports = { chatbot: router};