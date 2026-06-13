FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN chmod +x scripts/entrypoint.sh

EXPOSE 3000
CMD ["sh", "scripts/entrypoint.sh"]
