import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const BASE_URL = process.env.HOMELAB_URL;
const PROVIDER_ID = "llama-homelab";
const MODEL_ID = "homelab-gpu";
const FETCH_TIMEOUT_MS = 5_000;
const DEFAULT_CTX_SIZE = 32_768;
const MAX_TOKENS_CAP = 65_536;

function cleanModelName(id: string): string {
  return id
    .replace(/\.gguf$/, "")
    .replace(/-UD-Q\d_K_[A-Z]+$/, "")
    .replace(/-Q\d_K_[A-Z]+$/, "");
}

export default function (pi: ExtensionAPI) {
  let registered = false;

  pi.on("session_start", async (_event, ctx) => {
    if (registered) return;

    if (!BASE_URL) {
      ctx.ui.notify("Homelab: HOMELAB_URL not set, skipping", "warning");
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const [modelsRes, slotsRes] = await Promise.all([
        fetch(`${BASE_URL}/v1/models`, { signal: controller.signal }),
        fetch(`${BASE_URL}/slots`, { signal: controller.signal }),
      ]);

      clearTimeout(timeoutId);

      if (!modelsRes.ok || !slotsRes.ok) return;

      const modelsData = (await modelsRes.json()) as { data?: Array<{ id?: string }> };
      const slotsData = (await slotsRes.json()) as Array<{ n_ctx?: number }>;

      const modelId = modelsData?.data?.[0]?.id;
      if (!modelId) return;

      const ctxSize = slotsData?.[0]?.n_ctx ?? DEFAULT_CTX_SIZE;
      const ctxK = Math.round(ctxSize / 1_024);
      const displayName = cleanModelName(modelId);

      pi.registerProvider(PROVIDER_ID, {
        baseUrl: `${BASE_URL}/v1`,
        api: "openai-completions" as const,
        apiKey: "not-needed",
        models: [
          {
            id: MODEL_ID,
            name: `@aktech/london-rtx3090-${displayName} (${ctxK}K)`,
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: ctxSize,
            maxTokens: Math.min(Math.floor(ctxSize / 2), MAX_TOKENS_CAP),
            compat: {
              supportsDeveloperRole: false,
              supportsReasoningEffort: false,
            },
          },
        ],
      });

      registered = true;
      ctx.ui.notify(`Homelab: ${displayName} (${ctxK}K ctx)`, "info");
    } catch (err) {
      const message = err instanceof Error ? err.message : "server unreachable";
      ctx.ui.notify(`Homelab GPU: ${message}`, "warning");
    }
  });
}
