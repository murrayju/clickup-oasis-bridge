FROM node:20.8 as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20.8 as prod
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
RUN touch .env
COPY --from=build /app/dist ./dist
CMD ["node", "dist/index.js"]
