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

Use a native build so the app's local network settings are applied. On the same Wi-Fi network as the ESP32, open the app, select **Local**, enter `dryer-monitor.local` or the ESP32's IP address, and tap **Connect**. Allow local network access if iOS prompts. On Android, you can also use the IP printed by the ESP32 at startup. Use the local hostname on iOS. The app reads the firmware's `/status` and `/runs` endpoints over HTTP.

## Remote run history

Copy `.env.example` to `.env` and set `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the publishable key from your Supabase project. Rebuild the app after updating the file.

In the Supabase SQL Editor, run [the phone pairing setup](supabase/phone-pairing.sql). Copy the returned `phone_pairing_code` directly into **Cloud → Pair phone**. The app saves it in the phone's secure storage and opens cloud history automatically. Run the setup again only if you want a new code and need to revoke the old one.

The app reads the latest 30 completed runs through a read-only function. **Local** mode still shows live readings on home Wi-Fi. Keep pairing codes, firmware credentials, ingest tokens, and Supabase secret or service-role keys out of Git and chat.
