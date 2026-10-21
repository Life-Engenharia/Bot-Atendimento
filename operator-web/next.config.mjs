/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const backend = process.env.OPERATOR_BACKEND_URL || 'http://127.0.0.1:3000';
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      { source: '/assets/:path*', destination: `${backend}/assets/:path*` },
    ];
  },
};

export default nextConfig;
