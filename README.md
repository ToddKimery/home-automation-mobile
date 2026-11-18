# Home Automation Mobile

An Expo and TypeScript starter for monitoring an ESP32-C3 dryer sensor. The dashboard uses sample dryer status, temperature, humidity, and run history.

## Run the app

Use Node.js 22.13 or later.

```sh
npm ci
npm run typecheck
npm start
```

Open the project in a compatible Expo Go client or use an Android emulator or iOS simulator with an installed Expo client.

## Dryer data

The current firmware posts completed runs to Google Apps Script. A run includes an ID, start time, sample interval, and temperature and humidity arrays stored in tenths of a unit. A future Supabase integration needs the destination project and the run table or ingestion endpoint. Live readings also need an upload path because the current remote payload contains completed runs only.

Keep firmware credentials and Supabase environment values out of Git. A mobile client can use a Supabase publishable key with authenticated access and row-level security. Keep service-role and secret keys on the server.
