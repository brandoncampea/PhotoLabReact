import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { Readable } from 'node:stream'

const backendOrigin = 'http://127.0.0.1:3001'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-api-forwarder',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url || ''
          if (!url.startsWith('/api') && !url.startsWith('/uploads')) {
            return next()
          }

          try {
            const targetUrl = `${backendOrigin}${url}`
            const headers = new Headers()
            Object.entries(req.headers).forEach(([key, value]) => {
              if (key.toLowerCase() === 'host') return
              if (Array.isArray(value)) {
                value.forEach((v) => headers.append(key, v))
                return
              }
              if (typeof value === 'string') {
                headers.set(key, value)
              }
            })

            const method = (req.method || 'GET').toUpperCase()
            const response = await fetch(targetUrl, {
              method,
              headers,
              body: method === 'GET' || method === 'HEAD' ? undefined : (req as any),
              duplex: method === 'GET' || method === 'HEAD' ? undefined : 'half',
              redirect: 'manual',
            } as RequestInit)

            res.statusCode = response.status
            response.headers.forEach((value, key) => {
              if (key.toLowerCase() === 'transfer-encoding') return
              res.setHeader(key, value)
            })

            if (!response.body) {
              res.end()
              return
            }

            Readable.fromWeb(response.body as any).pipe(res)
          } catch {
            res.statusCode = 502
            res.end('Bad Gateway')
          }
        })
      },
    },
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'react-vendor'
            }

            if (id.includes('axios')) {
              return 'http-vendor'
            }

            return 'vendor'
          }
        },
      },
    },
  },
  server: {
    port: 3000,
  },
})
