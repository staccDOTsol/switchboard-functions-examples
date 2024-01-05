export class NodeError extends Error {
  constructor(message?: string) {
    super(message);

    Object.setPrototypeOf(this, NodeError.prototype);
  }
}

export class NodeStalledError extends NodeError {
  constructor(message = "Node stalled. Restarting...") {
    super(message);

    Object.setPrototypeOf(this, NodeStalledError.prototype);
  }

  //   getErrorMessage() {
  //     return "Something went wrong: " + this.message;
  //   }
}
