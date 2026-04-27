// pm2 ecosystem — production process supervisor for the 3 long-running services.
//
// Usage:
//   pnpm pulse:build           # tsc compile realtime + alerts to dist/, next build for web
//   pm2 start ecosystem.config.cjs
//   pm2 save && pm2 startup    # auto-start on boot (Linux/mac); Windows: pm2-installer
//
// Logs:  ./logs/<app>.{out,err}.log
// Health probes hit /health on the relevant port; pm2 itself watches the process,
// not the body — combine with `pulse:status` script for body-level checks.

module.exports = {
  apps: [
    {
      name: "pulse-web",
      cwd: "./apps/web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_WS_URL: "ws://localhost:8080",
        PULSE_HUB_URL: "http://127.0.0.1:8081",
      },
      autorestart: true,
      max_memory_restart: "512M",
      out_file: "../../logs/web.out.log",
      error_file: "../../logs/web.err.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "pulse-realtime",
      cwd: "./apps/realtime",
      script: "dist/index.js",
      env: {
        NODE_ENV: "production",
        WS_PORT: "8080",
        HUB_HTTP_PORT: "8081",
        PULSE_NATIVE_STREAMS: "binance,bybit,okx",
      },
      autorestart: true,
      max_memory_restart: "512M",
      out_file: "../../logs/realtime.out.log",
      error_file: "../../logs/realtime.err.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "pulse-alerts",
      cwd: "./apps/alerts",
      script: "dist/index.js",
      env: {
        NODE_ENV: "production",
        ALERT_INTERVAL_MS: "900000",
        ALERT_LOG_PATH: "./data/alerts.jsonl",
        ALERT_MIN_SEVERITY: "med",
        ALERT_FUNDING_SYMBOL: "BTCUSDT",
      },
      autorestart: true,
      max_memory_restart: "256M",
      out_file: "../../logs/alerts.out.log",
      error_file: "../../logs/alerts.err.log",
      merge_logs: true,
      time: true,
    },
  ],
};
