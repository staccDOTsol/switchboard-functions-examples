export function debugLogging(...args: string[]) {
  if (process.env.DEBUG) {
    console.log(args.join(" "));
  }
}
