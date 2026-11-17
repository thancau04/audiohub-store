FROM node:20-alpine

WORKDIR /app

# Chỉ copy package*.json trước để tận dụng Docker layer cache khi code thay đổi
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

USER node

CMD ["npm", "start"]
