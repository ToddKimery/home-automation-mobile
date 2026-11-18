# Home Automation Mobile

A native iOS and Android dryer monitor built with Expo and TypeScript. The app reads live status, temperature, humidity, and completed cycles from the ESP32 over Wi-Fi. It refreshes every 15 seconds and displays the timestamp of the most recent successful update.

## Build and run

Use Node.js 22.13 or later. For Android, install Android Studio and set up a connected device or emulator. For iOS, use macOS with Xcode.

```sh
npm ci
npm run typecheck
npm run android
# On macOS
npm run ios
```

Use a native build so the app's local network settings are applied. On the same Wi-Fi network as the ESP32, open the app, enter `dryer-monitor.local` or the ESP32's IP address, and tap **Connect**. Allow local network access if iOS prompts. On Android, you can also use the IP printed by the ESP32 at startup. Use the local hostname on iOS. The app reads the firmware's `/status` and `/runs` endpoints over HTTP.

## Supabase

The current firmware revision can upload completed runs to Supabase through `ingest_run`. The app reads from the board on the local network. Remote run history requires a confirmed Supabase read schema and authenticated access. Keep firmware credentials and Supabase environment values out of Git.
