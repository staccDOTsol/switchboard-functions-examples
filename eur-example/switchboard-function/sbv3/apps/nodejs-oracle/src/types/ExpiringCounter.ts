import LRUCache from "lru-cache";

export class ExpiringCounter {
  private counter = 0;

  constructor(readonly timeout: number) {}

  public add(): number {
    this.counter = this.counter + 1;

    // remove the value after the timeout interval
    setTimeout(() => {
      if (this.counter > 0) {
        this.counter = this.counter - 1;
      } else {
        this.counter = 0;
      }
    }, this.timeout).unref();

    return this.counter;
  }
}

export class ExpiringMetricMap {
  private map: LRUCache<string, ExpiringCounter>;

  constructor(readonly timeout: number, size = 1000) {
    this.map = new LRUCache<string, ExpiringCounter>({ maxSize: size });
  }

  public add(key: string) {
    if (!this.map.has(key)) {
      this.map.set(key, new ExpiringCounter(this.timeout));
    }
    return this.map.get(key)!.add();
  }
}
