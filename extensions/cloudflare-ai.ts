import { AuthStorage, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { OAuthCredentials, OAuthLoginCallbacks } from "@mariozechner/pi-ai";

// --- Config ----------------------------------------------------------------

const PROVIDER_ID = "cloudflare";
const OAUTH_NAME = "Cloudflare Workers AI";

const CF_API_ROOT = "https://api.cloudflare.com/client/v4";
const CF_DASH_TOKENS_URL = "https://dash.cloudflare.com/profile/api-tokens";

const FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_CTX = 8_192;
const MAX_OUTPUT_CAP = 16_384;
const MODELS_PER_PAGE = 100;

// Cloudflare API tokens don't auto-rotate; use a long sentinel expiry.
const LONG_EXPIRY_MS = 10 * 365 * 24 * 60 * 60 * 1000;

// --- Types -----------------------------------------------------------------

type ModelProperty = { property_id?: string; value?: string | number };
type CfModel = {
  name?: string;
  task?: { name?: string };
  properties?: ModelProperty[];
};
type ModelSearchResponse = { result?: CfModel[] };

type PiModelConfig = {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
  compat: { supportsDeveloperRole: boolean; supportsReasoningEffort: boolean };
};

type SavedCreds = { accountId: string; token: string };

// --- URL builders ----------------------------------------------------------

const providerBaseUrl = (accountId: string) => `${CF_API_ROOT}/accounts/${accountId}/ai/v1`;

function modelSearchUrl(accountId: string): string {
  const url = new URL(`${CF_API_ROOT}/accounts/${accountId}/ai/models/search`);
  url.searchParams.set("task", "Text Generation");
  url.searchParams.set("hide_experimental", "false");
  url.searchParams.set("per_page", String(MODELS_PER_PAGE));
  return url.toString();
}

// --- Model mapping ---------------------------------------------------------

const isVision = (name: string): boolean => /vision|llava|-vl-|multimodal/i.test(name);

const shortName = (id: string): string => id.replace(/^@cf\//, "");

function propInt(props: ModelProperty[] | undefined, key: string): number | undefined {
  const raw = props?.find((p) => p.property_id === key)?.value;
  if (raw === undefined || raw === null) return undefined;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function toPiModel(m: CfModel & { name: string }): PiModelConfig {
  const contextWindow =
    propInt(m.properties, "context_window") ??
    propInt(m.properties, "max_total_tokens") ??
    DEFAULT_CTX;
  const maxTokens =
    propInt(m.properties, "max_output_tokens") ??
    Math.min(Math.floor(contextWindow / 2), MAX_OUTPUT_CAP);
  return {
    id: m.name,
    name: shortName(m.name),
    reasoning: false,
    input: isVision(m.name) ? ["text", "image"] : ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow,
    maxTokens,
    compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
  };
}

function isTextGenerationModel(m: CfModel): m is CfModel & { name: string } {
  return typeof m.name === "string" && m.task?.name?.toLowerCase() === "text generation";
}

// --- API calls -------------------------------------------------------------

async function fetchModels(accountId: string, token: string): Promise<PiModelConfig[]> {
  const res = await fetch(modelSearchUrl(accountId), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`models/search HTTP ${res.status}`);

  const data = (await res.json()) as ModelSearchResponse;
  const textGen = (data.result ?? []).filter(isTextGenerationModel);
  if (textGen.length === 0) throw new Error("no text-generation models returned");
  return textGen.map(toPiModel);
}

// --- Credentials -----------------------------------------------------------

// Legacy credentials stored accountId in `refresh` before the dedicated field
// existed; prefer `accountId`, fall back to `refresh` for back-compat.
function getAccountId(cred: { accountId?: unknown; refresh?: unknown }): string {
  const fromField = typeof cred.accountId === "string" ? cred.accountId.trim() : "";
  if (fromField) return fromField;
  return typeof cred.refresh === "string" ? cred.refresh.trim() : "";
}

function parseAccountIdToken(raw: string): SavedCreds {
  const sep = raw.indexOf(":");
  if (sep <= 0 || sep === raw.length - 1) {
    throw new Error("expected format <account_id>:<api_token>");
  }
  const accountId = raw.slice(0, sep).trim();
  const token = raw.slice(sep + 1).trim();
  if (!accountId || !token) throw new Error("account id and token required");
  return { accountId, token };
}

function readSavedCreds(): SavedCreds | undefined {
  try {
    const storage = AuthStorage.create();
    const cred = storage.get(PROVIDER_ID);
    if (!cred || cred.type !== "oauth") return undefined;

    const token = cred.access?.trim();
    const accountId = getAccountId(cred);
    if (!accountId || !token) return undefined;

    const isLegacyShape = typeof cred.accountId !== "string" && typeof cred.refresh === "string";
    if (isLegacyShape) {
      storage.set(PROVIDER_ID, {
        type: "oauth",
        refresh: "",
        access: token,
        expires: typeof cred.expires === "number" ? cred.expires : Date.now() + LONG_EXPIRY_MS,
        accountId,
      });
    }

    return { accountId, token };
  } catch {
    return undefined;
  }
}

// --- Provider registration -------------------------------------------------

function registerFullProvider(pi: ExtensionAPI, accountId: string, models: PiModelConfig[]): void {
  pi.registerProvider(PROVIDER_ID, {
    baseUrl: providerBaseUrl(accountId),
    api: "openai-completions",
    models,
    oauth: buildOAuth(pi),
  });
}

function registerOAuthOnly(pi: ExtensionAPI): void {
  pi.registerProvider(PROVIDER_ID, {
    baseUrl: CF_API_ROOT,
    api: "openai-completions",
    oauth: buildOAuth(pi),
  });
}

function buildOAuth(pi: ExtensionAPI) {
  return {
    name: OAUTH_NAME,

    async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
      callbacks.onAuth({ url: CF_DASH_TOKENS_URL });

      const raw = await callbacks.onPrompt({
        message:
          "Enter <account_id>:<api_token> (Account ID from dash sidebar; API token scopes: Workers AI Read + Edit):",
      });
      const { accountId, token } = parseAccountIdToken(raw.trim());

      const models = await fetchModels(accountId, token);
      registerFullProvider(pi, accountId, models);

      return {
        refresh: "",
        access: token,
        expires: Date.now() + LONG_EXPIRY_MS,
        accountId,
      };
    },

    async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
      const accountId = getAccountId(credentials);
      if (!accountId) throw new Error("missing Cloudflare account id in stored credentials");

      const models = await fetchModels(accountId, credentials.access);
      registerFullProvider(pi, accountId, models);

      return {
        ...credentials,
        refresh: "",
        accountId,
        expires: Date.now() + LONG_EXPIRY_MS,
      };
    },

    getApiKey(credentials: OAuthCredentials): string {
      return credentials.access;
    },
  };
}

// --- Entry point -----------------------------------------------------------

export default async function (pi: ExtensionAPI): Promise<void> {
  // Register an oauth-only shell first so `/login cloudflare` is always available,
  // even before the user has logged in.
  registerOAuthOnly(pi);

  const creds = readSavedCreds();
  if (!creds) return;

  try {
    const models = await fetchModels(creds.accountId, creds.token);
    registerFullProvider(pi, creds.accountId, models);
  } catch {
    // Network/auth failure at startup: keep oauth-only shell so user can re-login.
  }
}
