# Home Automation Mobile

A native iOS and Android dryer monitor built with Expo and TypeScript. The app reads live status, temperature, humidity, and completed cycles from the ESP32 over the home network or Tailscale. It refreshes every 15 seconds and displays the timestamp of the most recent successful update.

## Build and run

Use Node.js 22.13 or later. For Android, install Android Studio and set up a connected device or emulator. For iOS, use macOS with Xcode.

```sh
npm ci
npm run typecheck
npm run android
# On macOS
npm run ios
```

Use a native build so the app's local network settings are applied. **Dryer** opens automatically and reads `/status` and `/runs` from the configured sensor. Use **Sensor settings** to enter the ESP32's local address or a Tailscale proxy URL, then tap **Save and connect**. Connect Tailscale when using the proxy away from home. Allow local network access if iOS prompts.

## Remote run history

Copy `.env.example` to `.env` and set `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the publishable key from your Supabase project. Rebuild the app after updating the file.

In the Supabase SQL Editor, run [the phone pairing setup](supabase/phone-pairing.sql). Copy the returned `phone_pairing_code` directly into **Dryer → Cloud run history → Pair phone**. The app saves it in the phone's secure storage and opens cloud history automatically. Run the setup again only if you want a new code and need to revoke the old one.

The app reads the latest 30 completed runs through a read-only function. Live readings and cloud history are shown on the same Dryer screen. Keep pairing codes, firmware credentials, ingest tokens, and Supabase secret or service-role keys out of Git and chat.

Tap any completed run to see temperature in °F and relative humidity in separate graphs. Expand **Runs on sensor** for graphs read directly from the ESP32. For Cloud graphs, run [the Cloud graphs upgrade](supabase/run-graphs.sql) after the pairing setup. The upgrade keeps the current pairing code and reads samples from `public.readings`.

To preconfigure a LAN or Tailscale sensor address in a build, set `EXPO_PUBLIC_DRYER_SENSOR_URL` in your local `.env`. The app automatically connects when you open **Dryer** and remembers the address you save in **Sensor settings**.

## WLED lights

Open **Lights**, enter a WLED base URL or a Tailscale-only proxy URL, and tap **Refresh status**. A build can prefill this with `EXPO_PUBLIC_WLED_URL` in its local `.env`. The app remembers that URL on the phone.

The tab uses GET on `/json/info`, `/json/state`, and `/json/eff` to show the device name, power, brightness, primary color, and effect. The effect list is optional.
