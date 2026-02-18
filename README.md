# Echo

A self-hostable voice, video, and chat application. Built with Express, Socket.IO, mediasoup, React, and Electron.

![Echo](screenshots/echo1.png)

## Features

- **Self-Hosted** — Run it on your own server. Your data stays yours.
- **Chat** — Channels, threads, reactions, pins, mentions, GIFs, and file uploads.
- **Voice** — Low-latency voice channels powered by mediasoup/WebRTC.
- **Screen Share** — Share your screen with anyone in a voice channel.
- **Webcam** — Video calls with multiple participants.
- **Familiar Interface** — Simple, clean UI that feels like home if you've used Discord.

## Self-Hosting

You can use your own backend with the official Echo clients, or build your own clients and distribute them yourself.

## Self-Hosting Backend Infrastructure

### Requirements

- Docker and Docker Compose
- A server with a public IP (for voice/video to work you need UDP)

Note: Cloudflare proxy will not work on the free plan.

### Quick Start

```bash
git clone https://github.com/jkleincodes/echo.git
cd echo
cp .env.example .env
docker compose up -d
```

Edit `.env` and set `MEDIASOUP_ANNOUNCED_IP` to your server's public IP address (or `127.0.0.1` for local-only use):

```env
MEDIASOUP_ANNOUNCED_IP=203.0.113.10
```

Start the server:

```bash
docker compose up -d
```

Echo is now running at **http://localhost:3001**.

### HTTPS with a Domain

If you have a domain name pointed at your server, Echo can automatically provision a TLS certificate via Caddy.

Add to your `.env`:

```env
DOMAIN=echo.example.com
APP_URL=https://echo.example.com
MEDIASOUP_ANNOUNCED_IP=203.0.113.10
```

Start with the `https` profile:

```bash
docker compose --profile https up -d
```

Caddy will automatically obtain and renew a Let's Encrypt certificate. Your instance is now available at **https://echo.example.com**.

> Make sure ports **80**, **443**, **3001**, and **10000-10100/udp** are open on your firewall.

### Connecting the Desktop Client

The Electron desktop client can connect to any Echo server:

1. Open the app and go to the login screen
2. Click **Advanced** at the bottom
3. Enter your server URL (e.g. `https://echo.example.com`)
4. Log in as usual

Security Note: Ensure that you trust the authentication server before logging in. Wouldn't want your password stolen!

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MEDIASOUP_ANNOUNCED_IP` | Yes | `127.0.0.1` | Public IP for WebRTC (voice/video) |
| `JWT_SECRET` | No | Auto-generated | JWT signing secret. Auto-generated and persisted on first run if not set |
| `APP_URL` | No | `http://localhost:3001` | Public URL of your instance (used in emails and invite links) |
| `DOMAIN` | No | `localhost` | Domain for Caddy HTTPS (only used with `--profile https`) |
| `EMAIL_FROM` | No | `Echo <noreply@localhost>` | Email sender address |
| `RESEND_API_KEY` | No | | [Resend](https://resend.com) API key for transactional emails (password reset, verification) |
| `GIPHY_API_KEY` | No | | [Giphy](https://developers.giphy.com) API key for GIF search |
| `APP_VERSION` | No | `1.0.0` | Version advertised to Electron clients for update checks |
| `APP_DOWNLOAD_URL` | No | | URL where `.dmg`/`.exe` builds are hosted. Empty disables update prompts |
| `APP_RELEASE_NOTES` | No | | Release notes shown in the update notification |

### Data

All persistent data is stored in `./server/data/`:

- `echo.db` — SQLite database
- `uploads/` — User-uploaded files
- `downloads/` — Desktop client builds (if hosting updates)
- `.jwt_secret` — Auto-generated JWT secret (if not set via env)

To back up your instance, copy the `server/data/` directory.

## Tech Stack

- **Server**: Express + Socket.IO + mediasoup (TypeScript, Node 20)
- **Client**: Electron + React 19 + mediasoup-client
- **Web**: React 19 + Vite
- **Database**: SQLite via Prisma
- **Reverse Proxy**: Caddy (optional, for HTTPS)

## Development

```bash
# Server
cd server && npm install && npm run dev

# Web app
cd web && npm install && npm run dev

# Desktop client
cd client && npm install && npm run dev
```

The server runs on port 3001. The web dev server proxies API requests to it automatically.
