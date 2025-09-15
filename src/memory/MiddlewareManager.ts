import type { Middleware } from "./middlewares/Middleware.ts";
export class MiddlewareManager {
  constructor(private readonly middlewares: Middleware[] = []) {}
  add(m: Middleware) {
    this.middlewares.push(m);
  }

  async beforeModelCall(
    ...args: Parameters<NonNullable<Middleware["beforeModelCall"]>>
  ) {
    for (const m of this.middlewares) await m.beforeModelCall?.(...args);
  }
  async afterAssistantMessage(
    ...args: Parameters<NonNullable<Middleware["afterAssistantMessage"]>>
  ) {
    for (const m of this.middlewares) await m.afterAssistantMessage?.(...args);
  }
}
