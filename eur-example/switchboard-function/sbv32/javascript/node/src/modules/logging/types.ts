export interface INodeLogger {
  env(key: string, value: string): void;
  log(level: string, message: string, id?: string): void;
  debug(message: string, id?: string): void;
  info(message: string, id?: string): void;
  warn(message: string, id?: string): void;
  error(message: string, id?: string): void;
}
