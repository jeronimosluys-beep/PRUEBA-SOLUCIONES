FROM node:22-slim
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
ENV PORT=3000 DATA_DIR=/data
RUN mkdir -p /data
EXPOSE 3000
CMD ["node","server.js"]
