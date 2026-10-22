FROM node:22-bookworm-slim

# Official Stockfish release. The "universal" binary picks AVX2/AVX-512/etc. at runtime.
# To upgrade: change both values (sha256 of the .tar.gz from the GitHub release).
ARG STOCKFISH_RELEASE=sf_19
ARG STOCKFISH_SHA256=9defc0d4e55d49c65a6d042f3e571a39fcea499ade6dbe741b53b8c65e03611f

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && curl -fsSL -o /tmp/sf.tar.gz \
      "https://github.com/official-stockfish/Stockfish/releases/download/${STOCKFISH_RELEASE}/stockfish-linux-x86-64-universal.tar.gz" \
 && echo "${STOCKFISH_SHA256}  /tmp/sf.tar.gz" | sha256sum -c - \
 && tar -xzf /tmp/sf.tar.gz -C /tmp stockfish/stockfish-linux-x86-64-universal \
 && mv /tmp/stockfish/stockfish-linux-x86-64-universal /usr/local/bin/stockfish \
 && rm -rf /tmp/sf.tar.gz /tmp/stockfish \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json server.mjs ./

ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server.mjs"]
