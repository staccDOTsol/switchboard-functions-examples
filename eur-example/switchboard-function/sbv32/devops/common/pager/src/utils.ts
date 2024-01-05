import PdClient from "node-pagerduty";

export async function sendPage(
  chain: string,
  pubkey: string,
  cluster: string,
  e: string
) {
  let routingKey = "dc6aa95f95d74b02c0b7c9e23d59cfcc";
  let severity = "critical";
  // if (cluster.includes("devnet") || cluster.includes("testnet")) {
  // routingKey = "e3f928e591004702d0b423d330941ee6";
  // severity = "info";
  // }
  let pdClient = new PdClient(routingKey);
  let customDetails = {
    group: cluster,
    function: pubkey,
    name: `V2 ${cluster} pager`,
    chain,
    error: e,
  };
  let payload = {
    payload: {
      summary: `Function Alert v3: ${cluster}`,
      timestamp: new Date().toISOString(),
      source: pubkey,
      severity,
      group: cluster,
      custom_details: customDetails,
    },
    routing_key: routingKey,
    event_action: "trigger",
    client: pubkey.toString(),
  };
  console.log(`Event sending to pagerduty: ${JSON.stringify(payload)}`);
  await pdClient.events.sendEvent(payload);
}
