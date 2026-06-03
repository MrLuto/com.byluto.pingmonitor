# Ping Monitor

Ping devices from Homey and use the online/offline status in Flows.

This app uses TCP-based monitoring because ICMP probing is not reliably supported on Homey runtimes.

## Features

- Add one or more ping targets manually (host/IP).
- Periodic TCP probing with configurable interval and timeout.
- Manual probe via capability (`Ping nu` / `Ping now`).
- Status capability with clear values: `Online` / `Offline`.
- Flow cards for automation:
  - Trigger: `Came online`
  - Trigger: `Went offline`
  - Condition: `Is online`
  - Condition: `Is offline`
  - Action: `Ping now`

## Device Settings

- `Host or IP`: target to monitor (for example `192.168.1.20` or `nas.local`)
- `Ping interval (seconds)`: how often to probe
- `Ping timeout (ms)`: timeout per attempt
- `TCP port`: port used for the reachability check (default `443`)

## Flow Usage

Common use cases:

- Notify when NAS/printer/server comes online.
- Trigger "offline alert" after device disappears.
- Use `Ping now` action before running dependent automations.

## Development

### Requirements

- Node.js (LTS)
- Homey CLI (`npm i -g homey`)
- Access to a Homey Pro (local)

### Install dependencies

```bash
npm install
```

### Run in development

```bash
npm run run
```

### Install directly to Homey

```bash
npm run install
```

### Validate/build

```bash
npm run lint
npm run validate
npm run build
```

## GitHub Workflows

This repository includes Homey workflows:

- `.github/workflows/homey-app-validate.yml`
- `.github/workflows/homey-app-version.yml`
- `.github/workflows/homey-app-publish.yml`

Required repository secret:

- `HOMEY_PAT`  
  Create it at: https://tools.developer.homey.app/me

Publish automation:

- Pushing a tag like `v1.0.1` triggers `.github/workflows/homey-app-publish.yml` automatically.
- You can also run publish manually via `workflow_dispatch`.
  
## Notes About Probing

- Reachability is determined by a TCP connection attempt to the configured port.
- A refused connection still counts as reachable, because the host responded.
- Choose a port that is likely to answer on your device, such as `443`, `80`, or `22`.

## License

PolyForm Noncommercial 1.0.0 (see [`LICENSE`](./LICENSE)).
Commercial use is not permitted under this license.
