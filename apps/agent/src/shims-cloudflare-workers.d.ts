declare module "cloudflare:workers" {
  export class DurableObject<Env = unknown> {
    constructor(ctx: DurableObjectState, env: Env);
    ctx: DurableObjectState;
    env: Env;
    fetch?(request: Request): Promise<Response>;
  }
  export class WorkerEntrypoint<Env = unknown> {
    constructor(ctx: ExecutionContext, env: Env);
    ctx: ExecutionContext;
    env: Env;
  }
  export class RpcTarget {}
}
