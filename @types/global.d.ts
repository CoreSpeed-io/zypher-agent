declare namespace NodeJS {
  interface ProcessEnv {
    CODEBASE_INDEXING_SERVICE_ENDPOINT: string;
    NODE_ENV: 'development' | 'production' | 'test';
  }
}