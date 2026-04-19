# pi-extensions

Extensions for [`@mariozechner/pi-coding-agent`](https://www.npmjs.com/package/@mariozechner/pi-coding-agent).

## Extensions

### `homelab-model-sync.ts`

Auto-register a self-hosted `llama.cpp` (or any OpenAI-compatible) server as a `pi` provider at session start. Queries `/v1/models` and `/slots` to detect the loaded model and context size, then registers it as provider `llama-homelab` / model `homelab-gpu`.

**Configure** via env var:

```bash
export HOMELAB_URL=http://your-server:8080   # default: http://localhost:8080
```

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
