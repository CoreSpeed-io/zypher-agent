FROM node:22-slim

# Install essential tools and ripgrep
RUN apt-get update && apt-get install -y \
    git \
    ripgrep \
    fd-find \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set up test workspace
WORKDIR /workspace
RUN git clone https://github.com/CoreSpeed-io/deckspeed-template.git . && \
    pnpm install

# Set up app
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Set environment variables
ENV NODE_ENV=development

# Start the agent in workspace
CMD ["pnpm", "start", "--workspace", "/workspace"] 