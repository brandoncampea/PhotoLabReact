FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --production

# Copy server code
COPY server/ ./server/

# Expose port
EXPOSE 8080

# Set environment
ENV PORT=8080

# Start server
CMD ["node", "server/server.js"]
