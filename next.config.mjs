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
      // IA de fondo / ONNX: solo para scripts locales; no deben ir en Functions.
      "node_modules/@imgly/**/*",
      "node_modules/onnxruntime-node/**/*",
      "node_modules/onnxruntime-common/**/*",
      "node_modules/@imgly/background-removal-node/**/*",
      // Binarios nativos de otras plataformas (Vercel = linux x64).
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
  // Permite HMR cuando Playwright abre el origen por 127.0.0.1
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
  // Módulos nativos que no deben empaquetarse: se cargan directo en el server.
  serverExternalPackages: [
    "@napi-rs/canvas",
    "sharp",
  ],
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
