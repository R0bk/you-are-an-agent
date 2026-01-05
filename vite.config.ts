import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 5173,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        {
          name: "coi-headers-for-webvm",
          configureServer(server) {
            server.middlewares.use((req, res, next) => {
              const url = req.url?.split('?')[0] || "";

              // Intercept writeHead to add COI headers for the entire app
              // (Required because WebVM iframe needs parent to be COI)
              const originalWriteHead = res.writeHead;
              res.writeHead = function(statusCode, statusMessage, headers) {
                const hdrs = typeof statusMessage === 'object' ? statusMessage : headers || {};

                // Add COI headers for all HTML pages and WebVM resources
                if (url.endsWith('.html') || url === '/' || url.startsWith('/webvm')) {
                  hdrs['Cross-Origin-Embedder-Policy'] = 'require-corp';
                  hdrs['Cross-Origin-Opener-Policy'] = 'same-origin';
                }

                // Add CORP for all resources
                if (!hdrs['Cross-Origin-Resource-Policy']) {
                  hdrs['Cross-Origin-Resource-Policy'] = 'cross-origin';
                }

                if (typeof statusMessage === 'object') {
                  return originalWriteHead.call(this, statusCode, hdrs);
                } else {
                  return originalWriteHead.call(this, statusCode, statusMessage, hdrs);
                }
              };

              // Serve index.html for /webvm and /webvm/
              if (url === "/webvm" || url === "/webvm/") {
                const indexPath = path.resolve(__dirname, "public", "webvm", "index.html");
                if (fs.existsSync(indexPath)) {
                  res.writeHead(200, {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cross-Origin-Embedder-Policy': 'require-corp',
                    'Cross-Origin-Opener-Policy': 'same-origin',
                  });
                  res.end(fs.readFileSync(indexPath));
                  return;
                }
              }

              next();
            });
          },
        },
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
