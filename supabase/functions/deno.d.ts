declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
  cron(name: string, schedule: string, handler: () => Promise<void> | void): void;
};
