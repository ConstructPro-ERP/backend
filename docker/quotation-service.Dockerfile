FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npx ts-node -r tsconfig-paths/register --transpile-only apps/quotation-service/src/main.ts || true

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY . .
EXPOSE 3009
CMD ["node", "-r", "ts-node/register", "-r", "tsconfig-paths/register", "apps/quotation-service/src/main.ts"]
