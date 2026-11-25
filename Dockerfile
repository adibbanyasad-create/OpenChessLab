FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY LICENSE THIRD_PARTY_NOTICES.md README.md SECURITY.md ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "const host=(process.env.ALLOWED_HOSTS||'127.0.0.1').split(',')[0].trim().replace(/^\./,'health.'); fetch('http://127.0.0.1:'+process.env.PORT+'/api/health',{headers:{host}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server/index.js"]
