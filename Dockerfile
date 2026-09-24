# Use Node.js 22 Alpine image
FROM node:24-alpine

# Install MultiWikiServer (wikiwise fork) from npm globally
RUN npm install @tiddlywiki/mws@latest -g

# Set working directory
WORKDIR /data

# Expose default MWS port
EXPOSE 8080

ENTRYPOINT ["mws"]
# Default command - users can override this with docker-compose
CMD ["listen", "--listener", "host=0.0.0.0", "port=8080"]

# docker run --rm --network host -it node:22-alpine sh