/** @type {import('next').NextConfig} */
const API = process.env.API_URL || process.env.NEXT_PUBLIC_API || "http://localhost:8000";
module.exports = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/:path*` }];
  },
};
