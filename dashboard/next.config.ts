import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";

function contentSecurityPolicy() {
  const scriptSrc = ["'self'", "'unsafe-inline'", isDevelopment ? "'unsafe-eval'" : ""]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://discord.com https://discordapp.com https://cdn.discordapp.com https://media.discordapp.net https://api.github.com https://raider.io https://*.raider.io https://render.worldofwarcraft.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.discordapp.com" },
      { protocol: "https", hostname: "media.discordapp.net" },
      { protocol: "https", hostname: "render.worldofwarcraft.com" },
      { protocol: "https", hostname: "cdnassets.raider.io" },
      { protocol: "https", hostname: "raider.io" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
        ],
      },
    ];
  },
};

export default nextConfig;
