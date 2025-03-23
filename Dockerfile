FROM oven/bun:slim

# Install essential tools and ripgrep
RUN apt-get update && apt-get install -y \
    git \
    ripgrep \
    fd-find \
    && rm -rf /var/lib/apt/lists/*

# Set up test workspace
WORKDIR /workspace
RUN git clone https://github.com/CoreSpeed-io/deckspeed-template.git . && \
    bun install --frozen-lockfile

# Set up app
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Set environment variables
ENV NODE_ENV=development

# Start the agent in workspace
CMD ["bun", "start", "--workspace", "/workspace"] 