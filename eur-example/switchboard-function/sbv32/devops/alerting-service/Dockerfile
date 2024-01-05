FROM node:18
WORKDIR /
COPY package*.json ./
RUN npm install --legacy-peer-deps
RUN npm install ts-node --legacy-peer-deps
COPY . .
CMD [ "npm", "run", "start" ]
