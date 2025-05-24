// src/setupProxy.js
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:3000', // Your backend
      changeOrigin: true,
      secure: false,
      // If needed, log proxy details for debugging:
      onProxyReq(proxyReq, req, res) {
        console.log(`[Proxy] ${req.method} ${req.originalUrl} -> ${proxyReq.getHeader('host')}`);
      },
    })
  );
};
