// PREPARE ENV FOR FUNCTION CALL TESTING
import { utils } from "ethers";

interface Config {
  verifyingContract: string;
  functionKey: string;
  callIds: string[];
  chainId: number;
  params: {
    values: string[];
    types: string[];
  }[];
}

// @NOTE: Modify the following to match your function in testing
const config: Config = {
  chainId: 1,
  verifyingContract: "0x0000000000000000000000000000000000000001",
  functionKey: "0x0000000000000000000000000000000000000001",
  callIds: ["0x0000000000000000000000000000000000000001"], // Add callIds here
  params: [
    // One param to each callId (can be empty)
    {
      values: ["1"], // Add values here
      types: ["uint256"], // Add corresponding types here
    },
  ],
};

// prepare environment with config
function prepareEnvironment(inputs: Config) {
  // Get params for function that the function call can respond to
  const params: Array<Array<number>> = inputs.params.map(
    ({ values, types }, i) => {
      // abiCoder.encode([ "uint", "string" ], [ 1234, "Hello World" ]);
      const paramSet = utils.arrayify(
        utils.defaultAbiCoder.encode(types, values)
      );
      return Array.from(paramSet);
    }
  );

  const paramsString: string = JSON.stringify(params);

  // Get function_call_ids for function that the function call can respond to
  const functionCallIdsAsArrays: Array<Array<number>> = inputs.callIds.map(
    (callId) => Array.from(utils.arrayify(callId))
  );

  const functionCallIdsString: string = JSON.stringify(functionCallIdsAsArrays);

  console.log(functionCallIdsString);

  // Set Environment Variables
  console.log("Please run:\n\n");
  console.log(`export FUNCTION_PARAMS=${paramsString}`);
  console.log(`export FUNCTION_CALL_IDS=${functionCallIdsString}`);
  console.log(`export CHAIN_ID=${inputs.chainId.toString()}`);
  console.log(`export FUNCTION_KEY=${inputs.functionKey}`);
  console.log(`export VERIFYING_CONTRACT=${inputs.verifyingContract}`);
}

// set environment variables
prepareEnvironment(config);
