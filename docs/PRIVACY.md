# Privacy Policy

RC Surface is a local-network extension.
It does not collect, transmit, or store personal data beyond the user's own machine and LAN.

## Data Stored Locally

| Data | Where | Lifetime |
|------|-------|----------|
| Self-signed TLS certificate + private key | Ableton `storageDirectory/certs/` | Until user deletes storage or cert expires/regenerates |
| Control mappings | Ableton storage | Persistent across sessions |
| Mapping presets | Ableton storage | Until deleted |
| Phone preferences | Phone browser storage | Until browser data is cleared |
| Audio analysis settings | Phone browser storage | Until browser data is cleared |

## Network Data

- The supported bridge path stays on the user's trusted LAN.
- No telemetry.
- No analytics.
- No crash reporting.
- No cloud control path.
- QR codes are generated locally in the panel UI.
- MediaPipe Hands runtime/model files are served locally by the extension.

## Phone Browser Data

The phone client runs in the browser. It does not install a native app.

Permissions are requested only for active features:

- motion/orientation sensors;
- selected audio input for amplitude and twelve audio descriptors;
- camera for MediaPipe hand tracking.

Sensor data is processed in the phone browser and sent as numeric control values over WebSocket.
Raw audio and raw video frames are not sent to RC Surface.

Capture asks the browser to turn off echo cancellation, noise suppression and
automatic gain control; what actually happens depends on the browser and driver. The selected device ID
is remembered in local browser storage. Opening or reloading AUD never starts capture on its own.

Only numeric measurements cross WebSocket: RMS, envelope, gate, attack,
transient, kick, snare, brightness, centroid, rolloff95, flux, flatness,
spread and low/mid/high band energy. No raw audio is transmitted.

## Third-Party Runtime

MediaPipe Hands is bundled with the extension and served over the local
connection. The hand-tracking model runs in the phone browser. Camera frames
are not sent to Google by this project.

On a fully offline network, core touch, motion, audio, mapping, mixer, and
camera hand-tracking controls continue to work because the MediaPipe runtime
and model files are bundled with the extension and served locally.
