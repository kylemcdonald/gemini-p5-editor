FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 7860

ENV PORT=7860
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "start", "--", "--hostname", "0.0.0.0", "--port", "7860"] 