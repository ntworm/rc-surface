# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | yes |
| 0.7.x and earlier | no |

## Reporting a Vulnerability

Do not report security problems in a public channel.
Use GitHub's private **Report a vulnerability** channel for this repository.
If that channel is unavailable, contact the maintainer privately instead of
opening a public issue.

We aim to acknowledge reports within 48 hours and release critical patches within 7 days.

## Scope

Plain HTTP binds to `127.0.0.1`, normally on port `8730`. Phone HTTPS/WSS
binds on the LAN, normally on `8731`. Occupied ports fall back to available
ports shown in the panel.

Attack surface:

- Self-signed TLS certificates generated per install and stored in Ableton `storageDirectory/certs/`.
- WebSocket command handler inside the Ableton Extensions SDK runtime.
- Static file server serving only `dist/static/` with path traversal protection.
- Phone browser APIs: camera, microphone, and motion/orientation sensors.
- Legacy Receiver copies open unauthenticated UDP `9000`. Receiver v2 in this source tree has no network socket; upgrading the extension alone does not replace devices already saved in a Live Set.

The current design assumes a trusted studio/home LAN. HTTPS protects the
browser transport and enables camera/microphone APIs. Controller and admin
actions also require cryptographically random session tokens that are
regenerated whenever the server starts, including panel Stop/Start without
reloading Live. Requests are classified as viewer,
controller, or admin and commands are authorized by role.

The controller token is delivered by the generated QR URL and then moved into
an HttpOnly, SameSite session cookie. Treat QR images, controller URLs, admin
URLs, and active browser sessions as credentials. A party that obtains one of
those tokens receives its associated role until the server restarts. Rescan
the new QR after restarting; old pages become read-only.

## HTTPS And Certificates

- Phone, panel, and admin browser clients should use HTTPS/WSS.
- Camera and microphone require a Secure Context on the phone.
- QR URLs use a LAN address so phones can reach the host.
- The certificate includes localhost, `127.0.0.1`, and current LAN IP SANs.
- If LAN IP coverage is stale, the extension can regenerate the certificate.
- Browsers still warn because the certificate is self-signed. The user must
  accept the warning once on each device/browser.

Private keys are never bundled in `.ablx` packages.

## Bundled Max devices — v2 migration

Receiver v2 accepts Trigger Note commands through its versioned integer SDK
parameter on the selected track. The extension verifies the parameter contract,
rejects old/ambiguous Receivers and never falls back to raw UDP. ON/OFF writes
are serialized per Receiver; an OFF retains the original device identity.
The optional Audio Sender uses Max's internal `send/receive` bus. Its input
is OFF at Receiver load; enable it only on intended destinations. Multiple
enabled Receivers intentionally hear that local bus. Both devices are plain
Max patchers without networking objects, external scripts or compiled externals.

This removes the unauthenticated MIDI network listener; it does not authenticate
other local Max patches. Only load trusted devices. Phone commands still require
the existing WSS role/token checks. No new firewall rule is needed for v2 MIDI.

Replace **both** devices and all old Receiver instances in saved Sets; merely
upgrading the extension or copying a new file into the library does not update
already-loaded devices. Back up the Set first. The new panel reads
**RC MIDI RECEIVER v2 / SDK / LOCAL MAX — NO UDP**. Do not remove an existing
firewall rule until every legacy Receiver is unloaded. A release check must
confirm the actual loaded version, no UDP 9000 listener attributable to it,
two-track note routing and OFF/cleanup. Source/patcher tests do not prove these
conditions in Live or establish latency. Device v2 field acceptance is pending.

Receiver v2.2 keeps v2.1's API-visible command parameter (automatable/stored)
behind an ordinary non-parameter **SDK Notes** gate. The gate is closed at
construction, so a restored command is dropped; after Live's post-initialization
notification the device arms itself, which first clears the previous value
without output. Device deactivation disarms and re-activation re-arms the same
way; Panic disarms until clicked. This is not authentication of automation/Undo
while armed. Never automate or MIDI-map the internal packet. Disarm before
recalling a device preset on a running instance: the lifecycle notification
arrives after initialization, not before preset values are restored.

### Required UDP firewall protection (legacy devices only)

On Windows, open **PowerShell as Administrator** and run once:

```powershell
New-NetFirewallRule -Name 'RC-Surface-MIDI-UDP9000-LAN-Block' -DisplayName 'RC Surface - block network MIDI UDP 9000' -Direction Inbound -Action Block -Enabled True -Profile Any -Protocol UDP -LocalPort 9000 -RemoteAddress '0.0.0.0-126.255.255.255','128.0.0.0-255.255.255.255','::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'
```

This blocks inbound UDP `9000` from non-loopback addresses for all programs
and profiles, leaving the IPv4 loopback sender path and TCP HTTPS/WSS
unmatched. It also affects other applications using UDP `9000`; that port
must be dedicated to this bridge. Keep Windows Firewall enabled on every
profile. The command uses Microsoft's supported
[firewall address ranges](https://learn.microsoft.com/en-us/powershell/module/netsecurity/new-netfirewallrule).
If the named rule already exists, inspect it instead of creating a duplicate.

Verify the effective rule and its filters:

```powershell
Get-NetFirewallRule -PolicyStore ActiveStore -Name 'RC-Surface-MIDI-UDP9000-LAN-Block' | Format-List Name,Enabled,Profile,Direction,Action
Get-NetFirewallRule -PolicyStore ActiveStore -Name 'RC-Surface-MIDI-UDP9000-LAN-Block' | Get-NetFirewallPortFilter
Get-NetFirewallRule -PolicyStore ActiveStore -Name 'RC-Surface-MIDI-UDP9000-LAN-Block' | Get-NetFirewallAddressFilter
```

Before release, verify that local notes still arrive, the phone still connects,
and UDP packets sent from a **second LAN machine** cause no Receiver activity
or MIDI events. A rule listing or a UDP port scan alone is not that proof.
Run the test with speakers muted and a MIDI monitor, not an audible instrument.

On macOS, use an equivalent host firewall policy blocking inbound UDP `9000`
on non-loopback interfaces, and repeat the same probe. Do not block all Live
network traffic: that also breaks the phone connection. Until this protection
is configured and verified, keep the Receiver unloaded on networked machines.
The extension does not silently install firewall rules or claim strict-loopback
isolation. For legacy devices this remains an OS-specific acceptance gate; v2 must instead pass the no-listener migration check.

To undo **only this rule**, first unload the Receiver, then run as administrator:

```powershell
Remove-NetFirewallRule -Name 'RC-Surface-MIDI-UDP9000-LAN-Block'
```

## Network Exposure

- Do not run the bridge on public, guest, or untrusted WiFi.
- Prefer same-room/studio LAN use.
- Do not publish or forward QR, controller, or admin URLs.
- Do not expose the bridge through public tunnels, public reverse proxies, or
  router port forwarding. Those deployments are outside the v1.0 threat model.
- Stop and start the server to invalidate all issued session tokens.

## Command Safety

Commands are JSON messages handled by project code. Read operations are
available to viewers; Live and mapping writes require a controller or admin;
whole-project configuration and server administration require an admin. They
must not call shell commands or write outside Ableton extension storage. New
commands must be classified, return diagnostics, and have tests.
