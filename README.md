# pi-extensions

[![CI](https://github.com/aktech/pi-extensions/actions/workflows/ci.yml/badge.svg)](https://github.com/aktech/pi-extensions/actions/workflows/ci.yml)

Extensions for [`@mariozechner/pi-coding-agent`](https://www.npmjs.com/package/@mariozechner/pi-coding-agent).

## Extensions

- **`homelab-model-sync`** — Auto-registers a self-hosted `llama.cpp` (or any OpenAI-compatible) server as a `pi` provider at session start. Set `HOMELAB_URL` to your server.
- **`cloudflare-ai`** — Adds [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) as a `/login` provider, exposing all Text Generation models via the OpenAI-compatible endpoint.
- **`prompt-char`** — Adds a `❯` prefix to the editor input line.

## Install

```bash
pi install git:github.com/aktech/pi-extensions
```

## License

MIT
