# pi-extensions

Extensions for [`@mariozechner/pi-coding-agent`](https://www.npmjs.com/package/@mariozechner/pi-coding-agent).

## Extensions

### `homelab-model-sync.ts`

Auto-register a self-hosted `llama.cpp` (or any OpenAI-compatible) server as a `pi` provider at session start. Queries `/v1/models` and `/slots` to detect the loaded model and context size, then registers it as provider `llama-homelab` / model `homelab-gpu`.

**Configure** via env var:

```bash
export HOMELAB_URL=http://your-server:8080   # default: http://localhost:8080
```

### `cloudflare-ai.ts`

Add [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) as a `/login` provider in `pi`. After login, fetches your full list of Text Generation models from Cloudflare's [models search API](https://developers.cloudflare.com/api/resources/ai/subresources/models/methods/list/) and exposes them via the [OpenAI-compatible endpoint](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/), so any model (e.g. `@cf/moonshotai/kimi-k2.5`, `@cf/meta/llama-3.3-70b-instruct-fp8-fast`) is usable.

**Setup:**

1. Create an API token at [dash.cloudflare.com → My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) with `Workers AI — Read` + `Workers AI — Edit`. Copy your Account ID from the dashboard right-hand sidebar.
2. In `pi`:
   ```
   /login cloudflare
   ```
   When prompted, enter `<account_id>:<api_token>` (colon-separated).
3. Pick a model:
   ```
   pi --provider cloudflare --model @cf/moonshotai/kimi-k2.5
   ```

Credentials persist in `~/.pi/agent/auth.json`. Clear with `/logout cloudflare`.

> Note: pi persists login-sourced credentials as `type:"oauth"` regardless of the actual auth scheme — it's pi's internal label for anything acquired through the `/login` flow, not an assertion that Cloudflare uses real OAuth (it doesn't for third-party tools).

### `prompt-char.ts`

Add a `❯` prefix to the editor input line.

## Install

```bash
pi install git:github.com/<youruser>/pi-extensions
```

Or clone and install locally:

```bash
git clone https://github.com/<youruser>/pi-extensions
pi install ./pi-extensions
```

List installed extensions:

```bash
pi list
```

## Usage

Once installed, extensions load automatically at `pi` session start. For `homelab-model-sync`, set `HOMELAB_URL` first, then run `pi`. The provider appears as `llama-homelab / homelab-gpu` and can be selected via `pi --provider llama-homelab`.

## Requirements

- `pi-coding-agent` installed (`npm i -g @mariozechner/pi-coding-agent`)
- Node runtime

## License

MIT
