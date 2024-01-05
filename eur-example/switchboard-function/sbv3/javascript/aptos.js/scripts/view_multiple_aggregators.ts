import { AggregatorAccount } from "../lib/cjs";

import { AptosClient } from "aptos";

const NODE_URL = "http://0.0.0.0:8080";
const SWITCHBOARD_ADDRESS =
  "0x5a538b86b2e15bde64a3d87ac5bae8a569eb93a22435dd4ecff5ec1f5a427383";

const aggregators = [
  "0x23ee4d7f5db22a4d1238bd8e8e3678d6fb8d1859320a408ebd9229d91b8d344d",
  "0x821748fb1a2cd59ed5ef0385959d4981d1b360b0f9ae26a2e7c6fe06def78a3f",
];

(async () => {
  AggregatorAccount.loadMultiple(
    /* client= */ new AptosClient(NODE_URL),
    /* aggregators= */ aggregators,
    /* switchboardAddress= */ SWITCHBOARD_ADDRESS
  )
    .then((response) => console.log("SUCCESS:", response))
    .catch((err) => console.error("ERROR:", err));
})();
