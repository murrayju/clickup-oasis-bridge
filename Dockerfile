FROM node:20 as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN git rev-parse HEAD > /app/GIT_SHA
RUN npm run build

FROM node:20 as prod
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
RUN touch .env
COPY --from=build /app/dist ./dist
COPY --from=build /app/GIT_SHA ./GIT_SHA
CMD ["node", "dist/index.js"]
