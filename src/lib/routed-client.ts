const operation = Symbol("database operation");
type Client = Record<PropertyKey, any>;

// Keep operations lazy so Prisma's array transactions remain genuine transactions.
export function createRoutedClient<T>(resolve: () => Promise<T>): T {
  function deferred(run: (client: Client) => any) {
    let promise: Promise<any> | undefined;
    const execute = () => promise ??= resolve().then(client => run(client as Client));
    return {
      [operation]: run,
      then: (ok: any, fail: any) => execute().then(ok, fail),
      catch: (fail: any) => execute().catch(fail),
      finally: (done: any) => execute().finally(done),
    };
  }
  return new Proxy({}, {
    get(_target, key) {
      if (key === "then") return undefined;
      if (key === "$transaction") return async (input: any, options: any) => {
        const client = await resolve() as Client;
        if (Array.isArray(input)) {
          if (input.some(item => !item?.[operation])) throw new Error("Mixed database transactions are not allowed.");
          return client.$transaction(input.map(item => item[operation](client)), options);
        }
        return client.$transaction(input, options);
      };
      if (typeof key === "string" && key.startsWith("$")) return (...args: any[]) => deferred(client => client[key](...args));
      return new Proxy({}, { get: (_delegate, method) => (...args: any[]) => deferred(client => client[key][method](...args)) });
    },
  }) as T;
}
