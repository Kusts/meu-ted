export class DurableObject<Env = unknown> {
  state: unknown;
  ctx: unknown;
  env: unknown;
  constructor(state: unknown, env: unknown) {
    this.state = state;
    this.ctx = state;
    this.env = env;
  }
}

export class WorkerEntrypoint {
  ctx: unknown;
  env: unknown;
  constructor(ctx: unknown, env: unknown) {
    this.ctx = ctx;
    this.env = env;
  }
}

export class RpcTarget {}
export default {
  DurableObject,
  WorkerEntrypoint,
  RpcTarget,
};
