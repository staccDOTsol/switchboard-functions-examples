// WARNING
// failing to fetch AWS S3 shards make debugging hard
const originalConsoleWarn = console.warn;
console.warn = (...args: any[]) => {
  const message = args.join(" ");

  if (!message.startsWith("Failed to fetch")) {
    originalConsoleWarn.apply(console, args);
  }
};

export * from "./main";
