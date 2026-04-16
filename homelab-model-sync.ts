import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const BASE_URL = "http://localhost:8080";
  const PROVIDER = "llama-homelab";

  pi.on("session_start", async (_event, ctx) => {
    try {
      const [modelsRes, slotsRes] = await Promise.all([
        fetch(`${BASE_URL}/v1/models`, { signal: AbortSignal.timeout(5000) }),
        fetch(`${BASE_URL}/slots`, { signal: AbortSignal.timeout(5000) }),
      ]);

      if (!modelsRes.ok || !slotsRes.ok) return;

      const modelsData = await modelsRes.json();
      const slotsData = await slotsRes.json();

      const modelId = modelsData?.data?.[0]?.id ?? "unknown";
      const ctxSize = slotsData?.[0]?.n_ctx ?? 32768;
      const ctxK = Math.round(ctxSize / 1024);

      const displayName = modelId
        .replace(/\.gguf$/, "")
        .replace(/-UD-Q\d_K_[A-Z]+$/, "")
        .replace(/-Q\d_K_[A-Z]+$/, "");

      pi.registerProvider(PROVIDER, {
        baseUrl: `${BASE_URL}/v1`,
        api: "openai-completions",
        apiKey: "not-needed",
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
        },
        models: [
          {
            id: "homelab-gpu",
            name: `${displayName} (${ctxK}K)`,
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: ctxSize,
            maxTokens: Math.min(Math.floor(ctxSize / 2), 65536),
          },
        ],
      });

      ctx.ui.notify(`Homelab: ${displayName} (${ctxK}K ctx)`, "info");
    } catch {
      ctx.ui.notify("Homelab GPU: server unreachable", "warn");
    }
  });
}
