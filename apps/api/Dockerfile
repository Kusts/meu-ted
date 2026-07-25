FROM node:22-alpine

RUN npm install -g pnpm@10.34.1

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts=false

COPY . .

EXPOSE 3001

CMD ["pnpm", "start"]
