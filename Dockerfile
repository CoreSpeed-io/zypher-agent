FROM node:22-slim

# Install essential tools and ripgrep
RUN apt-get update && apt-get install -y \
    git \
    ripgrep \
    fd-find \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Set environment variables
ENV NODE_ENV=development

CMD ["pnpm", "start"] 