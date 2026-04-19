/**
 * Unified LLM caller. Supports Anthropic, OpenAI, and Google Gemini.
 * All calls go direct from the browser to the provider's API.
 *
 * @param {object} opts
 * @param {"anthropic"|"openai"|"google"} opts.provider
 * @param {string} opts.apiKey
 * @param {string} opts.userMessage
 * @param {string} [opts.systemPrompt]  - optional system / instruction
 * @param {number} [opts.maxTokens]     - default 2000
 * @returns {Promise<string>}           - raw text response
 */
export async function callLLM({ provider, apiKey, userMessage, systemPrompt = "", maxTokens = 2000 }) {
  switch (provider) {
    case "anthropic": {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: userMessage }],
      };
      if (systemPrompt) body.system = systemPrompt;

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (data.error) throw new Error(`Anthropic: ${data.error.message}`);
      return data.content[0].text;
    }

    case "openai": {
      const messages = [];
      if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
      messages.push({ role: "user", content: userMessage });

      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: maxTokens,
          messages,
        }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(`OpenAI: ${data.error.message}`);
      return data.choices[0].message.content;
    }

    case "google": {
      const contents = [{ parts: [{ text: userMessage }] }];
      const body = { contents, generationConfig: { maxOutputTokens: maxTokens } };
      if (systemPrompt) {
        body.system_instruction = { parts: [{ text: systemPrompt }] };
      }

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = await resp.json();
      if (data.error) throw new Error(`Google: ${data.error.message}`);
      return data.candidates[0].content.parts[0].text;
    }

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
