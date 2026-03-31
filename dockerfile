#For the frontend to make the build
FROM node:20-alpine AS frontend-builder

COPY ./Frontend /app

WORKDIR /app

RUN npm install

RUN npm run build

#For the backend to copy the frontend build in the public folder and run the server(with the frontend)

FROM node:20-alpine

COPY ./Backend /app

WORKDIR /app

RUN npm install

COPY --from=frontend-builder /app/dist /app/public

CMD ["node", "server.js"]
