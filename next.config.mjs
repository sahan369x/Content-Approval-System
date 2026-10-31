/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a production build run alongside `npm run dev` without clobbering its .next folder.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  eslint: { ignoreDuringBuilds: true },
  images: { unoptimized: true },
};

export default nextConfig;
