/** @type {import('next').NextConfig} */
const isGhPages = process.env.GITHUB_PAGES === "true";
const basePath = isGhPages ? "/RGmotors" : "";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingExcludes: {
    "**/*": [
      "public/**/*",
      "public/cars/**/*",
      "public/cars/inventory/**/*",
      "public/cars/uploads/**/*",
      "public/cars/spin/**/*",
      "node_modules/@imgly/**/*",
      "node_modules/onnxruntime-node/**/*",
      "node_modules/onnxruntime-common/**/*",
      "node_modules/@imgly/background-removal-node/**/*",
      "node_modules/@napi-rs/canvas-android-arm64/**/*",
      "node_modules/@napi-rs/canvas-darwin-arm64/**/*",
      "node_modules/@napi-rs/canvas-darwin-x64/**/*",
      "node_modules/@napi-rs/canvas-linux-arm-gnueabihf/**/*",
      "node_modules/@napi-rs/canvas-linux-arm64-gnu/**/*",
      "node_modules/@napi-rs/canvas-linux-arm64-musl/**/*",
      "node_modules/@napi-rs/canvas-linux-riscv64-gnu/**/*",
      "node_modules/@napi-rs/canvas-win32-arm64-msvc/**/*",
      "node_modules/@napi-rs/canvas-win32-x64-msvc/**/*",
    ],
  },
  allowedDevOrigins: ["127.0.0.1"],
  ...(isGhPages
    ? {
        output: "export",
        basePath,
        assetPrefix: basePath,
        trailingSlash: true,
      }
    : {
        images: {
          formats: ["image/avif", "image/webp"],
          remotePatterns: [
            { protocol: "https", hostname: "drive.google.com" },
            { protocol: "https", hostname: "lh3.googleusercontent.com" },
            { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
            { protocol: "https", hostname: "public.blob.vercel-storage.com" },
            { protocol: "https", hostname: "*.blob.vercel-storage.com" },
          ],
        },
      }),
  serverExternalPackages: [
    "@napi-rs/canvas",
    "sharp",
  ],
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  async redirects() {
    if (isGhPages) return [];
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "rgmotorschile.cl" }],
        destination: "https://www.rgmotorschile.cl/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
