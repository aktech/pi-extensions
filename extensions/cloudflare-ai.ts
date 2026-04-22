import { AuthStorage, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { OAuthCredentials, OAuthLoginCallbacks } from "@mariozechner/pi-ai";

const PROVIDER_ID = "cloudflare";
const OAUTH_NAME = "Cloudflare Workers AI";
const FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_CTX = 8_192;
const PER_PAGE = 100;
const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;

type ModelProperty = { property_id?: string; value?: string | number };
type CfModel = {
  name?: string;
  task?: { name?: string };
  properties?: ModelProperty[];
};
type SearchResponse = { result?: CfModel[] };

type PiModel = {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
  compat: { supportsDeveloperRole: boolean; supportsReasoningEffort: boolean };
};

function propInt(props: ModelProperty[] | undefined, key: string): number | undefined {
  if (!props) return undefined;
  const p = props.find((x) => x.property_id === key);
  if (!p || p.value === undefined || p.value === null) return undefined;
  const n = typeof p.value === "number" ? p.value : parseInt(String(p.value), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function isVision(name: string): boolean {
  return /vision|llava|-vl-|multimodal/i.test(name);
}

function shortName(id: string): string {
  return id.replace(/^@cf\//, "");
}

function baseUrl(accountId: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`;
}

function readSavedCreds(): { accountId: string; token: string } | undefined {
  try {
    const storage = AuthStorage.create();
    const cred = storage.get(PROVIDER_ID);
    if (!cred || cred.type !== "oauth") return undefined;
    const token = cred.access?.trim();
    const accountIdNew = typeof cred.accountId === "string" ? cred.accountId.trim() : "";
    const accountIdLegacy = typeof cred.refresh === "string" ? cred.refresh.trim() : "";
    const accountId = accountIdNew || accountIdLegacy;
    if (!accountId || !token) return undefined;
    if (!accountIdNew && accountIdLegacy) {
      storage.set(PROVIDER_ID, {
        type: "oauth",
        refresh: "",
        access: token,
        expires: typeof cred.expires === "number" ? cred.expires : Date.now() + TEN_YEARS_MS,
        accountId,
      });
    }
    return { accountId, token };
  } catch {
    return undefined;
  }
}

async function fetchModels(accountId: string, token: string): Promise<PiModel[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url =
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search` +
      `?task=Text%20Generation&hide_experimental=false&per_page=${PER_PAGE}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`models/search HTTP ${res.status}`);
    const data = (await res.json()) as SearchResponse;
    const raw = (data.result ?? []).filter(
      (m): m is CfModel & { name: string } =>
        typeof m.name === "string" && (m.task?.name ?? "").toLowerCase() === "text generation",
    );
    if (raw.length === 0) throw new Error("no text-generation models returned");

    return raw.map((m) => {
      const ctxWindow =
        propInt(m.properties, "context_window") ??
        propInt(m.properties, "max_total_tokens") ??
        DEFAULT_CTX;
      const maxOut =
        propInt(m.properties, "max_output_tokens") ??
        Math.min(Math.floor(ctxWindow / 2), 16_384);
      const input: ("text" | "image")[] = isVision(m.name) ? ["text", "image"] : ["text"];
      return {
        id: m.name,
        name: shortName(m.name),
        reasoning: false,
        input,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: ctxWindow,
        maxTokens: maxOut,
        compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
      };
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function registerFullProvider(pi: ExtensionAPI, accountId: string, models: PiModel[]) {
  pi.registerProvider(PROVIDER_ID, {
    baseUrl: baseUrl(accountId),
    api: "openai-completions" as const,
    models,
    oauth: buildOAuth(pi),
  });
}

function registerOAuthOnly(pi: ExtensionAPI) {
  pi.registerProvider(PROVIDER_ID, {
    baseUrl: "https://api.cloudflare.com/client/v4",
    api: "openai-completions" as const,
    oauth: buildOAuth(pi),
  });
}

function buildOAuth(pi: ExtensionAPI) {
  return {
    name: OAUTH_NAME,

    async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
      callbacks.onAuth({ url: "https://dash.cloudflare.com/profile/api-tokens" });

      const raw = (
        await callbacks.onPrompt({
          message:
            "Enter <account_id>:<api_token> (Account ID from dash sidebar; API token scopes: Workers AI Read + Edit):",
        })
      ).trim();

      const sep = raw.indexOf(":");
      if (sep <= 0 || sep === raw.length - 1) {
        throw new Error("expected format <account_id>:<api_token>");
      }
      const accountId = raw.slice(0, sep).trim();
      const token = raw.slice(sep + 1).trim();
      if (!accountId || !token) throw new Error("account id and token required");

      const models = await fetchModels(accountId, token);
      registerFullProvider(pi, accountId, models);

      return {
        refresh: "",
        access: token,
        expires: Date.now() + TEN_YEARS_MS,
        accountId,
      };
    },

    async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
      // Cloudflare API tokens don't expire on a short cycle; just re-validate and extend.
      const accountId =
        (typeof credentials.accountId === "string" && credentials.accountId.trim()) ||
        (typeof credentials.refresh === "string" && credentials.refresh.trim()) ||
        "";
      if (!accountId) throw new Error("missing Cloudflare account id in stored credentials");
      const models = await fetchModels(accountId, credentials.access);
      registerFullProvider(pi, accountId, models);
      return {
        ...credentials,
        refresh: "",
        accountId,
        expires: Date.now() + TEN_YEARS_MS,
      };
    },

    getApiKey(credentials: OAuthCredentials): string {
      return credentials.access;
    },
  };
}

export default async function (pi: ExtensionAPI) {
  registerOAuthOnly(pi);

  const creds = readSavedCreds();
  if (!creds) return;

  try {
    const models = await fetchModels(creds.accountId, creds.token);
    registerFullProvider(pi, creds.accountId, models);
  } catch {
    // Leave oauth-only provider in place; user can /login cloudflare again.
  }
}
