import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/socket.io/:path*',
        // Arahkan ke panel Pterodactyl kamu
        destination: 'http://panel.fromscratch.web.id:20218/socket.io/:path*',
      },
    ];
  },
};

export default nextConfig;