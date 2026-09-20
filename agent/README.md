# wirely-agent

Run [Wirely](https://wirely.app) design generation through the opencode already installed on your
own machine.

Wirely normally generates screens with an API key you paste into settings. This agent is the other
option: it runs the generation locally against your own opencode account, so the work is paid for by
a subscription you already have rather than per-token.

## How it works

The agent dials out to Wirely over ordinary HTTPS and asks whether you have any design work waiting.
When you hit Generate in the browser, it picks the job up, runs it through `opencode run`, and posts
the finished HTML back.

Nothing connects *to* your machine. There is no tunnel, no relay, and no inbound port to open. Your
opencode credentials never leave the machine, and Wirely never sees them.

## Install

```sh
npm install -g wirely-agent
```

Needs Node 18 or newer, and [opencode](https://opencode.ai) on your `PATH`. Check with
`opencode --version`.

## Use

Mint a token in Wirely under **Settings → Local agent**, then:

```sh
wirely-agent login <token>
wirely-agent
```

Leave it running while you design. Pick an `opencode` model in the composer and generation runs here
instead of on Wirely's servers.

## Commands

| command | what it does |
| --- | --- |
| `wirely-agent` | Runs the agent. Same as `wirely-agent run`. |
| `wirely-agent login <token>` | Saves your token to `~/.config/wirely/agent.json`. |
| `wirely-agent doctor` | Prints which Wirely it points at, whether a token is saved, and which opencode it found. Start here when something is wrong. |

## Environment

| variable | default | purpose |
| --- | --- | --- |
| `WIRELY_URL` | `https://wirely.app` | Which Wirely to connect to. Set this to run against a local dev server. |
| `WIRELY_TOKEN` | — | Token, overriding the saved one. Useful in CI or a container. |
| `OPENCODE_BIN` | `opencode` | Path to the opencode binary. |
| `WIRELY_MODEL` | — | `provider/model` to use when a job does not name one. |

## Troubleshooting

**`No local agent is connected`** in the browser. The agent is not running, or it is pointed at a
different Wirely. Run `wirely-agent doctor` and check the URL matches the site you are using.

**`Wirely rejected the token`.** The token was revoked or belongs to another account. Mint a new one
in settings and run `login` again.

**`opencode is not installed`.** The agent could not find the binary. Install opencode, or set
`OPENCODE_BIN` to its full path.

**Generations are slow.** Free opencode models vary enormously, from about 15 seconds to several
minutes for the same prompt. Pick a faster one in the composer.

## Cost and privacy

The agent sends your prompt to opencode and the resulting HTML back to Wirely, which stores it as
pages in your project. It reads and writes nothing else on your machine: each job runs in a
throwaway temporary directory that is deleted when the job ends.

Polling is paced so an agent you forget to stop costs close to nothing: every couple of seconds
while you are working, dropping to every 30 seconds once it has been idle for half an hour.

## License

MIT
