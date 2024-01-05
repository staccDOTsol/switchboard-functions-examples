FROM node:lts-alpine
ENV NODE_ENV production

# FINAL IMAGE
WORKDIR /home/node/task-runner-api
RUN echo "{\"type\": \"module\"}" >> package.json
RUN npm i --save swagger-ui-express@4.6.2
# copy the public files and manifests
COPY --chown=node:node --chmod=700 ./public/ ./public/
COPY --chown=node:node --chmod=700 ./.well-known/ ./.well-known/
COPY ./dist/ ./dist/
# copy the source code so swagger can auto-generate the spec from the ts doc comments
COPY ./src/ ./src/
USER node
EXPOSE 8080
CMD ["node", "--experimental-specifier-resolution=node", "--enable-source-maps", "./dist/index.js"]