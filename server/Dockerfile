FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY js/economy-rules.js ./js/economy-rules.js
USER node
EXPOSE 3000
CMD ["node", "server/src/index.js"]
