# pi-remote

Fork of [@q.roy/pi-remote](https://github.com/ruanqisevik/pi-mono-extensions) with Tailscale integration, token auth enforcement, and UI improvements. Published as [`@noahsaso/pi-remote`](https://www.npmjs.com/package/@noahsaso/pi-remote).

## Highlights

- Remote pi sessions over WebSocket in a mobile-friendly browser UI
- Tailscale HTTPS serving with per-session `/pi/{id}/` routes
- Discovery service at `/pi/` for switching between active sessions
- Token auth enforced for HTTP, WebSocket, and API access
- QR code shown in the launching terminal and reposted in pi chat output
- Compact remote info widget is now optional in remote mode and can be toggled with `/remote:widget`
- `/remote <qr-url>` supports overriding the in-session QR target for demos without changing the actual session URL

## Packages

| Package | Description |
|---------|-------------|
| [remote](packages/remote) | Remote terminal access for pi via WebSocket and browser, with Tailscale HTTPS serving, discovery service, chat QR output, and a toggleable remote widget |

## Documentation

For installation, usage, commands, architecture, and API details, see:

- [`packages/remote/README.md`](packages/remote/README.md)

## Screenshots

### Browser — Remote access modal
<img src="https://raw.githubusercontent.com/noahsaso/pi-remote/main/packages/remote/docs/remote-access-modal.png" width="360" alt="Remote access modal" />

### TUI — Optional remote info widget
![TUI widget](https://raw.githubusercontent.com/noahsaso/pi-remote/main/packages/remote/docs/tui-widget.png)
