/* eslint-disable no-unused-vars */
import "mocha";

import type { SwitchboardAttestationProgram } from "../target/types/switchboard_attestation_program";

import { SwitchboardAttestationQueue } from "./utils/queue";
import { Switchboard } from "./utils/switchboard";
import {
  createFunction,
  functionMrEnclave,
  nativeMint,
  unixTimestampBN,
} from "./utils/utils";

import type { Program } from "@coral-xyz/anchor";
import { AnchorProvider } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import { BN, parseRawMrEnclave, sleep } from "@switchboard-xyz/common";
import {
  type AnchorWallet,
  NativeMint,
  parseRawBuffer,
} from "@switchboard-xyz/solana.js";
import assert from "assert";

interface CreateRequestInitParams {
  maxContainerParamsLen: number;
  containerParams: string;
  garbageCollectionSlot: number;
}

type CreateRequestAndTriggerParams = CreateRequestInitParams & {
  bounty: number;
  slotsUntilExpiration: number;
  validAfterSlot: number;
};

type CreateRequestParams =
  | (Partial<CreateRequestInitParams> & {
      trigger?: false | undefined;
      attestationQueue?: PublicKey;
    })
  | (Partial<CreateRequestAndTriggerParams> & {
      trigger: true;
      attestationQueue?: PublicKey;
    });

const DEFAULT_REQUEST_PARAMS: CreateRequestParams = {
  maxContainerParamsLen: null,
  containerParams: "",
  garbageCollectionSlot: null,
};

async function createRequest(
  switchboard: Switchboard<SwitchboardAttestationProgram>,
  functionPubkey: PublicKey,
  params: Partial<CreateRequestParams> & { trigger: boolean } = {
    trigger: false,
  },
  functionAuthority?: Keypair
): Promise<[PublicKey, string]> {
  const functionRequestKeypair = Keypair.generate();
  const signers = functionAuthority
    ? [functionRequestKeypair, functionAuthority]
    : [functionRequestKeypair];

  // const functionState =
  //   await switchboard.program.account.functionAccountData.fetch(functionPubkey);

  if (params.trigger) {
    const txn = await switchboard.program.methods
      .functionRequestInitAndTrigger({
        maxContainerParamsLen:
          params.maxContainerParamsLen ??
          DEFAULT_REQUEST_PARAMS.maxContainerParamsLen,
        containerParams: Buffer.from(
          params.containerParams ?? DEFAULT_REQUEST_PARAMS.containerParams
        ),
        garbageCollectionSlot: params.garbageCollectionSlot
          ? new BN(params.garbageCollectionSlot)
          : null,
        bounty: params.bounty ? new BN(params.bounty) : null,
        slotsUntilExpiration: params.slotsUntilExpiration
          ? new BN(params.slotsUntilExpiration)
          : null,
        validAfterSlot: params.validAfterSlot
          ? new BN(params.validAfterSlot)
          : null,
      })
      .accounts({
        request: functionRequestKeypair.publicKey,
        authority: switchboard.payer.publicKey,
        function: functionPubkey,
        functionAuthority: functionAuthority
          ? functionAuthority.publicKey
          : null,
        escrow: anchor.utils.token.associatedAddress({
          mint: nativeMint,
          owner: functionRequestKeypair.publicKey,
        }),
        mint: nativeMint,
        state: switchboard.attestationProgramState,
        attestationQueue:
          params.attestationQueue ?? switchboard.defaultQueue.publicKey,
        payer: switchboard.payer.publicKey,
      })
      .signers(signers)
      .rpc();

    return [functionRequestKeypair.publicKey, txn];
  } else {
    const txn = await switchboard.program.methods
      .functionRequestInit({
        maxContainerParamsLen:
          params.maxContainerParamsLen ??
          DEFAULT_REQUEST_PARAMS.maxContainerParamsLen,
        containerParams: Buffer.from(
          params.containerParams ?? DEFAULT_REQUEST_PARAMS.containerParams
        ),
        garbageCollectionSlot: params.garbageCollectionSlot
          ? new BN(params.garbageCollectionSlot)
          : null,
      })
      .accounts({
        request: functionRequestKeypair.publicKey,
        authority: switchboard.payer.publicKey,
        function: functionPubkey,
        functionAuthority: functionAuthority
          ? functionAuthority.publicKey
          : null,
        escrow: anchor.utils.token.associatedAddress({
          mint: nativeMint,
          owner: functionRequestKeypair.publicKey,
        }),
        mint: nativeMint,
        state: switchboard.attestationProgramState,
        attestationQueue:
          params.attestationQueue ?? switchboard.defaultQueue.publicKey,
        payer: switchboard.payer.publicKey,
      })
      .signers(signers)
      .rpc();

    return [functionRequestKeypair.publicKey, txn];
  }
}

describe("Request Tests", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;

  const _program: Program<SwitchboardAttestationProgram> =
    anchor.workspace.SwitchboardAttestationProgram;

  const payer = (provider.wallet as AnchorWallet).payer;
  const payerTokenWallet = anchor.utils.token.associatedAddress({
    mint: nativeMint,
    owner: payer.publicKey,
  });
  const authority = payer;

  let switchboard: Switchboard<SwitchboardAttestationProgram>;

  before(async () => {
    switchboard = await Switchboard.initialize(_program);
  });

  /**
   * Test the function can provide access control to requests
   * - requestsDisabled: prevents request creation from all accounts
   * - requestsRequireAuthorization: prevents request creation from non-authority accounts
   */
  describe("FunctionRequest AccessControl", () => {
    // payer 1
    let disabledFunctionRequestPubkey: PublicKey;
    // payer 2
    let permissionedFunctionPubkey: PublicKey;

    before(async () => {
      [disabledFunctionRequestPubkey] = await createFunction(
        switchboard.program1,
        switchboard.defaultQueue.publicKey,
        "Function_RequestsDisabledTests",
        {
          requestsDisabled: true,
          authority: switchboard.payer1,
        }
      );

      [permissionedFunctionPubkey] = await createFunction(
        switchboard.program2,
        switchboard.defaultQueue.publicKey,
        "Function_RequestAuthorizationTests",
        {
          requestsRequireAuthorization: true,
          authority: switchboard.payer2,
        }
      );
    });

    it("Fails to create a request if function authority disabled requests", async () => {
      // using payer3 to create a request for a function that has requests disabled
      const program = switchboard.program3;
      const payer = switchboard.payer3;

      const requestKeypair = Keypair.generate();

      await assert.rejects(async () => {
        const txn = await program.methods
          .functionRequestInit({
            maxContainerParamsLen: null,
            containerParams: Buffer.from(""),
            garbageCollectionSlot: null,
          })
          .accounts({
            request: requestKeypair.publicKey,
            authority: payer.publicKey,
            function: disabledFunctionRequestPubkey,
            functionAuthority: null,
            escrow: anchor.utils.token.associatedAddress({
              mint: nativeMint,
              owner: requestKeypair.publicKey,
            }),

            mint: nativeMint,
            state: switchboard.attestationProgramState,
            attestationQueue: switchboard.defaultQueue.publicKey,
            payer: payer.publicKey,
          })
          .signers([requestKeypair])
          .rpc();
      }, new RegExp(/UserRequestsDisabled|The FunctionAccount has set requests_disabled to true and disabled this action/g));
    });

    it("Fails to create a request if function authority disabled requests and fn authority signs", async () => {
      // using payer3 to create a request for a function that has requests disabled
      const program = switchboard.program3;
      const payer = switchboard.payer3;

      const requestKeypair = Keypair.generate();

      await assert.rejects(async () => {
        const txn = await program.methods
          .functionRequestInit({
            maxContainerParamsLen: null,
            containerParams: Buffer.from(""),
            garbageCollectionSlot: null,
          })
          .accounts({
            request: requestKeypair.publicKey,
            authority: payer.publicKey,
            function: disabledFunctionRequestPubkey,
            functionAuthority: switchboard.payer1.publicKey,
            escrow: anchor.utils.token.associatedAddress({
              mint: nativeMint,
              owner: requestKeypair.publicKey,
            }),
            mint: nativeMint,
            state: switchboard.attestationProgramState,
            attestationQueue: switchboard.defaultQueue.publicKey,
            payer: payer.publicKey,
          })
          .signers([requestKeypair, switchboard.payer1])
          .rpc();
      }, new RegExp(/UserRequestsDisabled|The FunctionAccount has set requests_disabled to true and disabled this action/g));
    });

    it("Fails to create a request if function authority set requestsRequireAuthorization and didnt sign", async () => {
      // using payer3 to create a request for a function that has requests disabled
      const program = switchboard.program3;
      const payer = switchboard.payer3;

      const requestKeypair = Keypair.generate();

      await assert.rejects(async () => {
        const txn = await program.methods
          .functionRequestInit({
            maxContainerParamsLen: null,
            containerParams: Buffer.from(""),
            garbageCollectionSlot: null,
          })
          .accounts({
            request: requestKeypair.publicKey,
            authority: payer.publicKey,
            function: disabledFunctionRequestPubkey,
            functionAuthority: null,
            escrow: anchor.utils.token.associatedAddress({
              mint: nativeMint,
              owner: requestKeypair.publicKey,
            }),
            mint: nativeMint,
            state: switchboard.attestationProgramState,
            attestationQueue: switchboard.defaultQueue.publicKey,
            payer: payer.publicKey,
          })
          .signers([requestKeypair])
          .rpc();
      }, new RegExp(/UserRequestsDisabled|The FunctionAccount has set requests_disabled to true and disabled this action/g));
    });

    it("Creates a request if function authority set requestsRequireAuthorization and signs the txn", async () => {
      // using payer3 to create a request for a function that has requests disabled
      const program = switchboard.program3;
      const payer = switchboard.payer3;

      const requestKeypair = Keypair.generate();

      const txn = await switchboard.program3.methods
        .functionRequestInit({
          maxContainerParamsLen: null,
          containerParams: Buffer.from(""),
          garbageCollectionSlot: null,
        })
        .accounts({
          request: requestKeypair.publicKey,
          authority: switchboard.payer3.publicKey,
          function: permissionedFunctionPubkey,
          functionAuthority: switchboard.payer2.publicKey,
          escrow: anchor.utils.token.associatedAddress({
            mint: nativeMint,
            owner: requestKeypair.publicKey,
          }),
          mint: nativeMint,
          state: switchboard.attestationProgramState,
          attestationQueue: switchboard.defaultQueue.publicKey,
          payer: switchboard.payer3.publicKey,
        })
        .signers([requestKeypair, switchboard.payer2])
        .rpc();
    });
  });

  /**
   * Test the function request init functionality
   * - creates a request from a keypair
   */
  describe("FunctionRequest Init", () => {
    let functionPubkey: PublicKey;

    before(async () => {
      [functionPubkey] = await createFunction(
        switchboard.program1,
        switchboard.defaultQueue.publicKey,
        "Function_RequestInitTests",
        { authority: switchboard.payer1 }
      );
    });

    it("Creates a request from a keypair", async () => {
      // using payer3 to create a request for a function that has requests disabled
      const program = switchboard.program3;
      const payer = switchboard.payer3;

      const requestKeypair = Keypair.generate();

      const txn = await program.methods
        .functionRequestInit({
          maxContainerParamsLen: null,
          containerParams: Buffer.from(""),
          garbageCollectionSlot: null,
        })
        .accounts({
          request: requestKeypair.publicKey,
          authority: payer.publicKey,
          function: functionPubkey,
          functionAuthority: null,
          escrow: anchor.utils.token.associatedAddress({
            mint: nativeMint,
            owner: requestKeypair.publicKey,
          }),
          mint: nativeMint,
          state: switchboard.attestationProgramState,
          attestationQueue: switchboard.defaultQueue.publicKey,
          payer: payer.publicKey,
        })
        .signers([requestKeypair])
        .rpc();
    });
  });

  /**
   * Tests

   * 1. The assigned oracle verifies the request (success)
   *    - The queue_idx rotates
   *    - The timestamp is updated
   * 2. Fails to double verify a successful request (throws RequestRoundAlreadyClosed)
   * 3. The unassigned oracle fails to verify the request and throws IllegalVerifier (fail)
   * !! TODO: implement an is_disabled field on requests using the ResourceLevel enum !!
   * 4. !! Fails to verify the request if the request is disabled (throws RequestDisabled) !! (TODO)
   * 5. Fails to verify if the mr_enclave is all 0s (throws InvalidMrEnclave)
   * 6. !! Fails to verify if the function has 0 mr_enclaves defined (throws MrEnclavesEmpty) !! (TODO)
   * 7. Fails to verify the request if the mr_enclave mismatches (throws IncorrectMrEnclave)
   * 8. Fails to verify the request if the container params hash mismatches (throws InvalidParamsHash)
   * 9. !! Fails to verify if the function has a request_fee > 0 and the function escrow was not provided (throws MissingFunctionEscrow) !! (TODO)
   * 10. !! Fails to verify if the function has a request_fee > 0 and the function escrow is not correct (throws InvalidEscrow) !! (TODO)
   * 11. Fails to verify if the observed timestamp is more than 20 seconds off (throws IncorrectObservedTime)
   */
  describe("FunctionRequest Verification", () => {
    let functionPubkey: PublicKey;

    // this should always fail verification for more re-use without triggering
    let defaultRequestPubkey: PublicKey;

    before(async () => {
      [functionPubkey] = await createFunction(
        _program,
        switchboard.defaultQueue.publicKey,
        "FunctionRequestVerificationTests"
      );

      [defaultRequestPubkey] = await createRequest(
        switchboard,
        functionPubkey,
        {
          trigger: true,
        }
      );
    });

    it("Verifies a function request", async () => {
      const [myFunctionPubkey] = await createFunction(
        _program,
        switchboard.defaultQueue.publicKey,
        "FunctionRequestVerificationTests"
      );
      const functionState =
        await switchboard.program.account.functionAccountData.fetch(
          myFunctionPubkey
        );

      const [requestPubkey] = await createRequest(
        switchboard,
        myFunctionPubkey,
        {
          trigger: true,
        }
      );

      const unixTimestamp = Math.floor(Date.now() / 1000);
      const enclaveSigner = Keypair.generate();

      const requestState =
        await switchboard.program.account.functionRequestAccountData.fetch(
          requestPubkey
        );

      const verifier = switchboard.defaultQueue.getVerifier(
        requestState.activeRequest.queueIdx
      );

      await switchboard.program.methods
        .functionRequestVerify({
          observedTime: new BN(unixTimestamp),
          errorCode: 0,
          mrEnclave: Array.from(functionMrEnclave).slice(0, 32),
          requestSlot: requestState.activeRequest.requestSlot,
          containerParamsHash: requestState.containerParamsHash,
        })
        .accounts({
          ...verifier.getAccounts(),
          request: requestPubkey,
          functionEnclaveSigner: enclaveSigner.publicKey,
          escrow: anchor.utils.token.associatedAddress({
            mint: nativeMint,
            owner: requestPubkey,
          }),
          function: myFunctionPubkey,
          functionEscrow: functionState.escrowTokenWallet,
          state: switchboard.attestationProgramState,
          attestationQueue: switchboard.defaultQueue.publicKey,
          receiver: payerTokenWallet,
        })
        .signers([verifier.signer, enclaveSigner])
        .rpc();
    });

    it("Fails to double verify a transaction", async () => {
      const [myFunctionPubkey] = await createFunction(
        _program,
        switchboard.defaultQueue.publicKey,
        "FunctionRequestDoubleVerificationTest"
      );
      const functionState =
        await switchboard.program.account.functionAccountData.fetch(
          myFunctionPubkey
        );

      const [requestPubkey] = await createRequest(
        switchboard,
        myFunctionPubkey,
        {
          trigger: true,
        }
      );

      const enclaveSigner = Keypair.generate();

      const initialRequestState =
        await switchboard.program.account.functionRequestAccountData.fetch(
          requestPubkey
        );

      const requestSlot = initialRequestState.activeRequest.requestSlot;

      const verifier = switchboard.defaultQueue.getVerifier(
        initialRequestState.activeRequest.queueIdx
      );

      // successful verification
      await switchboard.program.methods
        .functionRequestVerify({
          observedTime: unixTimestampBN(),
          errorCode: 0,
          mrEnclave: Array.from(functionMrEnclave).slice(0, 32),
          requestSlot: requestSlot,
          containerParamsHash: initialRequestState.containerParamsHash,
        })
        .accounts({
          ...verifier.getAccounts(),
          request: requestPubkey,
          functionEnclaveSigner: enclaveSigner.publicKey,
          escrow: anchor.utils.token.associatedAddress({
            mint: nativeMint,
            owner: requestPubkey,
          }),
          function: myFunctionPubkey,
          functionEscrow: functionState.escrowTokenWallet,
          state: switchboard.attestationProgramState,
          attestationQueue: switchboard.defaultQueue.publicKey,
          receiver: payerTokenWallet,
        })
        .signers([verifier.signer, enclaveSigner])
        .rpc();

      let retryCount = 3;
      let postVerifyRequestState =
        await switchboard.program.account.functionRequestAccountData.fetch(
          requestPubkey
        );
      while (
        retryCount > 0 &&
        postVerifyRequestState.activeRequest.requestSlot.toNumber() === 0 &&
        postVerifyRequestState.activeRequest.status.requestPending === undefined
      ) {
        await sleep(1000);
        postVerifyRequestState =
          await switchboard.program.account.functionRequestAccountData.fetch(
            requestPubkey
          );
        retryCount--;
      }

      await assert.rejects(async () => {
        const newEnclaveSigner = Keypair.generate();

        await switchboard.program.methods
          .functionRequestVerify({
            observedTime: unixTimestampBN(),
            errorCode: 0,
            mrEnclave: Array.from(functionMrEnclave).slice(0, 32),
            requestSlot: requestSlot,
            containerParamsHash: initialRequestState.containerParamsHash,
          })
          .accounts({
            ...verifier.getAccounts(),
            request: requestPubkey,
            functionEnclaveSigner: newEnclaveSigner.publicKey,
            escrow: anchor.utils.token.associatedAddress({
              mint: nativeMint,
              owner: requestPubkey,
            }),
            function: myFunctionPubkey,
            functionEscrow: functionState.escrowTokenWallet,
            state: switchboard.attestationProgramState,
            attestationQueue: switchboard.defaultQueue.publicKey,
            receiver: payerTokenWallet,
          })
          .signers([verifier.signer, newEnclaveSigner])
          .rpc();
      }, new RegExp(/RequestRoundAlreadyClosed|6052/g));
    });

    it("Failes to verify an already settled request", async () => {
      const [myFunctionPubkey] = await createFunction(
        _program,
        switchboard.defaultQueue.publicKey,
        "FunctionRequestVerificationTests"
      );
      const functionState =
        await switchboard.program.account.functionAccountData.fetch(
          myFunctionPubkey
        );

      const [requestPubkey] = await createRequest(
        switchboard,
        myFunctionPubkey,
        {
          trigger: true,
        }
      );

      const unixTimestamp = Math.floor(Date.now() / 1000);
      const enclaveSigner = Keypair.generate();

      const requestState =
        await switchboard.program.account.functionRequestAccountData.fetch(
          requestPubkey
        );

      const verifier = switchboard.defaultQueue.getVerifier(
        requestState.activeRequest.queueIdx
      );

      const requestSlot = requestState.activeRequest.requestSlot;

      await switchboard.program.methods
        .functionRequestVerify({
          observedTime: new BN(unixTimestamp),
          errorCode: 0,
          mrEnclave: Array.from(functionMrEnclave).slice(0, 32),
          requestSlot: requestState.activeRequest.requestSlot,
          containerParamsHash: requestState.containerParamsHash,
        })
        .accounts({
          ...verifier.getAccounts(),
          request: requestPubkey,
          functionEnclaveSigner: enclaveSigner.publicKey,
          escrow: anchor.utils.token.associatedAddress({
            mint: nativeMint,
            owner: requestPubkey,
          }),
          function: myFunctionPubkey,
          functionEscrow: functionState.escrowTokenWallet,
          state: switchboard.attestationProgramState,
          attestationQueue: switchboard.defaultQueue.publicKey,
          receiver: payerTokenWallet,
        })
        .signers([verifier.signer, enclaveSigner])
        .rpc();

      await sleep(500);

      await assert.rejects(async () => {
        await switchboard.program.methods
          .functionRequestVerify({
            observedTime: unixTimestampBN(),
            errorCode: 0,
            mrEnclave: Array.from(functionMrEnclave).slice(0, 32),
            requestSlot: requestState.activeRequest.requestSlot,
            containerParamsHash: requestState.containerParamsHash,
          })
          .accounts({
            ...verifier.getAccounts(),
            request: requestPubkey,
            functionEnclaveSigner: enclaveSigner.publicKey,
            escrow: anchor.utils.token.associatedAddress({
              mint: nativeMint,
              owner: requestPubkey,
            }),
            function: myFunctionPubkey,
            functionEscrow: functionState.escrowTokenWallet,
            state: switchboard.attestationProgramState,
            attestationQueue: switchboard.defaultQueue.publicKey,
            receiver: payerTokenWallet,
          })
          .signers([verifier.signer, enclaveSigner])
          .rpc();
      }, new RegExp("RequestRoundAlreadyClosed"));
    });

    it("Fails to verify a request if an unassigned oracle responds", async () => {
      const functionState =
        await switchboard.program.account.functionAccountData.fetch(
          functionPubkey
        );

      const requestState =
        await switchboard.program.account.functionRequestAccountData.fetch(
          defaultRequestPubkey
        );

      // uses the function idx
      const queueIdx = requestState.activeRequest.queueIdx + 1;
      const verifier = switchboard.defaultQueue.getVerifier(queueIdx);

      const unixTimestamp = Math.floor(Date.now() / 1000);
      const enclaveSigner = Keypair.generate();

      await assert.rejects(async () => {
        await switchboard.program.methods
          .functionRequestVerify({
            observedTime: new BN(unixTimestamp),
            errorCode: 0,
            mrEnclave: Array.from(functionMrEnclave).slice(0, 32),
            requestSlot: requestState.activeRequest.requestSlot,
            containerParamsHash: requestState.containerParamsHash,
          })
          .accounts({
            ...verifier.getAccounts(),
            request: defaultRequestPubkey,
            functionEnclaveSigner: enclaveSigner.publicKey,
            escrow: anchor.utils.token.associatedAddress({
              mint: nativeMint,
              owner: defaultRequestPubkey,
            }),
            function: functionPubkey,
            functionEscrow: functionState.escrowTokenWallet,
            state: switchboard.attestationProgramState,
            attestationQueue: switchboard.defaultQueue.publicKey,
            receiver: payerTokenWallet,
          })
          .signers([verifier.signer, enclaveSigner])
          .rpc();
      }, new RegExp("IllegalVerifier"));
    });

    it("Fails to verify a request if the provided mr_enclave is empty", async () => {
      const functionState =
        await switchboard.program.account.functionAccountData.fetch(
          functionPubkey
        );

      const requestState =
        await switchboard.program.account.functionRequestAccountData.fetch(
          defaultRequestPubkey
        );

      const unixTimestamp = Math.floor(Date.now() / 1000);
      const enclaveSigner = Keypair.generate();

      const verifier = switchboard.defaultQueue.getVerifier(
        requestState.activeRequest.queueIdx
      );

      await assert.rejects(async () => {
        await switchboard.program.methods
          .functionRequestVerify({
            observedTime: new BN(unixTimestamp),
            errorCode: 0,
            mrEnclave: new Array(32).fill(0),
            requestSlot: requestState.activeRequest.requestSlot,
            containerParamsHash: requestState.containerParamsHash,
          })
          .accounts({
            ...verifier.getAccounts(),
            request: defaultRequestPubkey,
            functionEnclaveSigner: enclaveSigner.publicKey,
            escrow: anchor.utils.token.associatedAddress({
              mint: nativeMint,
              owner: defaultRequestPubkey,
            }),
            function: functionPubkey,
            functionEscrow: functionState.escrowTokenWallet,
            state: switchboard.attestationProgramState,
            attestationQueue: switchboard.defaultQueue.publicKey,
            receiver: payerTokenWallet,
          })
          .signers([verifier.signer, enclaveSigner])
          .rpc();
      }, new RegExp("InvalidMrEnclave"));
    });

    it("Fails to verify a request if the provided mr_enclave is incorrect", async () => {
      const functionState =
        await switchboard.program.account.functionAccountData.fetch(
          functionPubkey
        );

      const requestState =
        await switchboard.program.account.functionRequestAccountData.fetch(
          defaultRequestPubkey
        );

      const unixTimestamp = Math.floor(Date.now() / 1000);
      const enclaveSigner = Keypair.generate();

      const verifier = switchboard.defaultQueue.getVerifier(
        requestState.activeRequest.queueIdx
      );

      await assert.rejects(async () => {
        await switchboard.program.methods
          .functionRequestVerify({
            observedTime: new BN(unixTimestamp),
            errorCode: 0,
            mrEnclave: Array.from(
              parseRawMrEnclave("NotTheRightMrEnclave", true)
            ),
            requestSlot: requestState.activeRequest.requestSlot,
            containerParamsHash: requestState.containerParamsHash,
          })
          .accounts({
            ...verifier.getAccounts(),
            request: defaultRequestPubkey,
            functionEnclaveSigner: enclaveSigner.publicKey,
            escrow: anchor.utils.token.associatedAddress({
              mint: nativeMint,
              owner: defaultRequestPubkey,
            }),
            function: functionPubkey,
            functionEscrow: functionState.escrowTokenWallet,
            state: switchboard.attestationProgramState,
            attestationQueue: switchboard.defaultQueue.publicKey,
            receiver: payerTokenWallet,
          })
          .signers([verifier.signer, enclaveSigner])
          .rpc();
      }, new RegExp("IncorrectMrEnclave"));
    });

    it("Fails to verify a request if the container params mismatch", async () => {
      const functionState =
        await switchboard.program.account.functionAccountData.fetch(
          functionPubkey
        );

      const requestState =
        await switchboard.program.account.functionRequestAccountData.fetch(
          defaultRequestPubkey
        );

      const unixTimestamp = Math.floor(Date.now() / 1000);
      const enclaveSigner = Keypair.generate();

      const verifier = switchboard.defaultQueue.getVerifier(
        requestState.activeRequest.queueIdx
      );

      await assert.rejects(async () => {
        await switchboard.program.methods
          .functionRequestVerify({
            observedTime: new BN(unixTimestamp),
            errorCode: 0,
            mrEnclave: Array.from(functionMrEnclave),
            requestSlot: requestState.activeRequest.requestSlot,
            containerParamsHash: Array.from(
              parseRawBuffer("NotTheRightParamsHash", 32)
            ),
          })
          .accounts({
            ...verifier.getAccounts(),
            request: defaultRequestPubkey,
            functionEnclaveSigner: enclaveSigner.publicKey,
            escrow: anchor.utils.token.associatedAddress({
              mint: nativeMint,
              owner: defaultRequestPubkey,
            }),
            function: functionPubkey,
            functionEscrow: functionState.escrowTokenWallet,
            state: switchboard.attestationProgramState,
            attestationQueue: switchboard.defaultQueue.publicKey,
            receiver: payerTokenWallet,
          })
          .signers([verifier.signer, enclaveSigner])
          .rpc();
      }, new RegExp("InvalidParamsHash"));
    });

    it("Fails to verify a request if the observed timestamp has more than 20 seconds of drift with the on-chain clock", async () => {
      const functionState =
        await switchboard.program.account.functionAccountData.fetch(
          functionPubkey
        );

      const requestState =
        await switchboard.program.account.functionRequestAccountData.fetch(
          defaultRequestPubkey
        );

      const unixTimestamp = Math.floor(Date.now() / 1000);
      const enclaveSigner = Keypair.generate();

      const verifier = switchboard.defaultQueue.getVerifier(
        requestState.activeRequest.queueIdx
      );

      await assert.rejects(async () => {
        await switchboard.program.methods
          .functionRequestVerify({
            observedTime: new BN(unixTimestamp + 300),
            errorCode: 0,
            mrEnclave: Array.from(functionMrEnclave),
            requestSlot: requestState.activeRequest.requestSlot,
            containerParamsHash: requestState.containerParamsHash,
          })
          .accounts({
            ...verifier.getAccounts(),
            request: defaultRequestPubkey,
            functionEnclaveSigner: enclaveSigner.publicKey,
            escrow: anchor.utils.token.associatedAddress({
              mint: nativeMint,
              owner: defaultRequestPubkey,
            }),
            function: functionPubkey,
            functionEscrow: functionState.escrowTokenWallet,
            state: switchboard.attestationProgramState,
            attestationQueue: switchboard.defaultQueue.publicKey,
            receiver: payerTokenWallet,
          })
          .signers([verifier.signer, enclaveSigner])
          .rpc();
      }, new RegExp("IncorrectObservedTime"));
    });
  });

  /**
   * Token transfer tests
   *
   * Tests
   *
   * 1. Correct amounts are sent when all token fees are set
   * 2. Request should fail open when not enough fees are provided but enough to set error_code
   */
  describe("FunctionRequest Rewards", () => {
    let functionPubkey: PublicKey;

    let queueWithReward: SwitchboardAttestationQueue;

    before(async () => {
      queueWithReward = await SwitchboardAttestationQueue.getOrCreate(
        switchboard.program,
        {
          attestationQueueKeypair: Keypair.generate(),
          params: {
            reward: 100,
            numVerifiers: 1,
          },
          verifiers: [
            {
              keypair: Keypair.generate(),
              signerKeypair: Keypair.generate(),
            },
          ],
        }
      );

      [functionPubkey] = await createFunction(
        switchboard.program,
        queueWithReward.publicKey,
        "FunctionRequestRewardsTests",
        {
          requestsFee: 10,
        }
      );
    });

    it("Sends the correct amount when queue.reward, function.requests_fee, and request.bounty greater than 0", async () => {
      try {
        const [requestPubkey] = await createRequest(
          switchboard,
          functionPubkey,
          {
            trigger: false,
            attestationQueue: queueWithReward.publicKey,
          }
        );

        const requestEscrow = anchor.utils.token.associatedAddress({
          mint: nativeMint,
          owner: requestPubkey,
        });

        const pretriggerAccount = await switchboard.mint.getAccount(
          requestEscrow
        );
        assert.equal(Number(pretriggerAccount.amount), 0);

        await switchboard.program.methods
          .functionRequestTrigger({
            bounty: new BN(1),
            slotsUntilExpiration: null,
            validAfterSlot: null,
          })
          .accounts({
            request: requestPubkey,
            authority: switchboard.payer.publicKey,
            escrow: requestEscrow,
            function: functionPubkey,
            state: switchboard.attestationProgramState,
            attestationQueue: queueWithReward.publicKey,
            payer: switchboard.payer.publicKey,
          })
          .rpc();

        const requestState =
          await switchboard.program.account.functionRequestAccountData.fetch(
            requestPubkey
          );

        assert.equal(requestState.activeRequest.bounty.toNumber(), 1);

        const posttriggerAccount = await switchboard.mint.getAccount(
          requestEscrow
        );
        assert.equal(Number(posttriggerAccount.amount), 111);

        const functionState =
          await switchboard.program.account.functionAccountData.fetch(
            functionPubkey
          );

        const unixTimestamp = Math.floor(Date.now() / 1000);
        const enclaveSigner = Keypair.generate();

        const verifier = queueWithReward.getVerifier(
          requestState.activeRequest.queueIdx
        );

        const initialRewardBalance = Number(
          (await switchboard.mint.getAccount(payerTokenWallet)).amount
        );
        const initialFunctionRewardEscrow = Number(
          (await switchboard.mint.getAccount(functionState.escrowTokenWallet))
            .amount
        );

        await switchboard.program.methods
          .functionRequestVerify({
            observedTime: new BN(unixTimestamp),
            errorCode: 0,
            mrEnclave: Array.from(functionMrEnclave).slice(0, 32),
            requestSlot: requestState.activeRequest.requestSlot,
            containerParamsHash: requestState.containerParamsHash,
          })
          .accounts({
            ...verifier.getAccounts(),
            request: requestPubkey,
            functionEnclaveSigner: enclaveSigner.publicKey,
            escrow: anchor.utils.token.associatedAddress({
              mint: nativeMint,
              owner: requestPubkey,
            }),
            function: functionPubkey,
            functionEscrow: functionState.escrowTokenWallet,
            state: switchboard.attestationProgramState,
            attestationQueue: queueWithReward.publicKey,
            receiver: payerTokenWallet,
          })
          .signers([verifier.signer, enclaveSigner])
          .rpc();

        const finalRewardBalance = Number(
          (await switchboard.mint.getAccount(payerTokenWallet)).amount
        );
        assert.equal(finalRewardBalance - initialRewardBalance, 101); // 100 (reward) + 1 (bounty)
        const finalFunctionRewardEscrow = Number(
          (await switchboard.mint.getAccount(functionState.escrowTokenWallet))
            .amount
        );
        assert.equal(
          finalFunctionRewardEscrow - initialFunctionRewardEscrow,
          10
        );

        const finalEscrowBalance = Number(
          (await switchboard.mint.getAccount(requestEscrow)).amount
        );
        assert.equal(finalEscrowBalance, 0);
      } catch (error) {
        console.error(error);
        throw error;
      }
    });
  });

  /**
   * Error code status reporting
   *
   * 1. Error code less than 200 still pays out
   */
  describe("FunctionRequest ErrorCodes", () => {
    let queueWithReward: SwitchboardAttestationQueue;

    let functionPubkey: PublicKey;

    before(async () => {
      queueWithReward = await SwitchboardAttestationQueue.getOrCreate(
        switchboard.program,
        {
          attestationQueueKeypair: Keypair.generate(),
          params: {
            reward: 100,
            numVerifiers: 1,
          },
          verifiers: [
            {
              keypair: Keypair.generate(),
              signerKeypair: Keypair.generate(),
            },
          ],
        }
      );

      [functionPubkey] = await createFunction(
        switchboard.program,
        queueWithReward.publicKey,
        "FunctionRequestErrorCodesTests",
        {
          requestsFee: 10,
        }
      );
    });

    it("An error code of #1-199 still sets the enclave_signer", async () => {
      const functionState =
        await switchboard.program.account.functionAccountData.fetch(
          functionPubkey
        );

      const expectedStartingBalance = 111 / LAMPORTS_PER_SOL;

      const expectedRequestCost = expectedStartingBalance;

      await Promise.all(
        [1, 99, 100, 199].map(async (errorCode) => {
          const [requestPubkey] = await createRequest(
            switchboard,
            functionPubkey,
            {
              trigger: true,
              bounty: 1,
              attestationQueue: queueWithReward.publicKey,
            }
          );

          const unixTimestamp = Math.floor(Date.now() / 1000);
          const enclaveSigner = Keypair.generate();

          const initialRequestState =
            await switchboard.program.account.functionRequestAccountData.fetch(
              requestPubkey
            );

          const initialBalance = await switchboard.mint.getAssociatedBalance(
            requestPubkey
          );

          assert.equal(initialBalance, expectedStartingBalance);

          const verifier = queueWithReward.getVerifier(
            initialRequestState.activeRequest.queueIdx
          );

          await switchboard.program.methods
            .functionRequestVerify({
              observedTime: new BN(unixTimestamp),
              errorCode: errorCode,
              mrEnclave: Array.from(functionMrEnclave).slice(0, 32),
              requestSlot: initialRequestState.activeRequest.requestSlot,
              containerParamsHash: initialRequestState.containerParamsHash,
            })
            .accounts({
              ...verifier.getAccounts(),
              request: requestPubkey,
              functionEnclaveSigner: enclaveSigner.publicKey,
              escrow: anchor.utils.token.associatedAddress({
                mint: nativeMint,
                owner: requestPubkey,
              }),
              function: functionPubkey,
              functionEscrow: functionState.escrowTokenWallet,
              state: switchboard.attestationProgramState,
              attestationQueue: queueWithReward.publicKey,
              receiver: payerTokenWallet,
            })
            .signers([verifier.signer, enclaveSigner])
            .rpc();

          let retryCount = 3;
          let finalRequestState =
            await switchboard.program.account.functionRequestAccountData.fetch(
              requestPubkey
            );
          while (
            retryCount > 0 &&
            finalRequestState.activeRequest.requestSlot.toNumber() === 0
          ) {
            await sleep(1000);
            finalRequestState =
              await switchboard.program.account.functionRequestAccountData.fetch(
                requestPubkey
              );
            retryCount--;
          }

          assert.equal(finalRequestState.errorStatus, errorCode);

          assert(
            finalRequestState.activeRequest.enclaveSigner.equals(
              enclaveSigner.publicKey
            )
          );

          assert(
            finalRequestState.activeRequest.status.requestSuccess !== undefined
          );

          const finalBalance = await switchboard.mint.getAssociatedBalance(
            requestPubkey
          );

          const requestCost = initialBalance - finalBalance;

          assert.equal(requestCost, expectedRequestCost);
        })
      );
    });

    it("An error code of > 199 resets the enclave_signer to Pubkey::default()", async () => {
      const functionState =
        await switchboard.program.account.functionAccountData.fetch(
          functionPubkey
        );

      const expectedStartingBalance = 111 / LAMPORTS_PER_SOL;

      // The request_fee does NOT get paid out if the error code is greater than 199
      const expectedRequestCost = 101 / LAMPORTS_PER_SOL;

      // the error codes to test
      const errorCodes = [200, 201, 250, 251, 253, 254, 255];

      await Promise.all(
        errorCodes.map(async (errorCode) => {
          const [requestPubkey] = await createRequest(
            switchboard,
            functionPubkey,
            {
              trigger: true,
              bounty: 1,
              attestationQueue: queueWithReward.publicKey,
            }
          );

          const initialRequestState =
            await switchboard.program.account.functionRequestAccountData.fetch(
              requestPubkey
            );

          const verifier = queueWithReward.getVerifier(
            initialRequestState.activeRequest.queueIdx
          );

          const initialBalance = await switchboard.mint.getAssociatedBalance(
            requestPubkey
          );

          assert.equal(initialBalance, expectedStartingBalance);

          const enclaveSigner = Keypair.generate();

          await switchboard.program.methods
            .functionRequestVerify({
              observedTime: unixTimestampBN(),
              errorCode: errorCode,
              mrEnclave: Array.from(functionMrEnclave).slice(0, 32),
              requestSlot: initialRequestState.activeRequest.requestSlot,
              containerParamsHash: initialRequestState.containerParamsHash,
            })
            .accounts({
              ...verifier.getAccounts(),
              request: requestPubkey,
              functionEnclaveSigner: enclaveSigner.publicKey,
              escrow: anchor.utils.token.associatedAddress({
                mint: nativeMint,
                owner: requestPubkey,
              }),
              function: functionPubkey,
              functionEscrow: functionState.escrowTokenWallet,
              state: switchboard.attestationProgramState,
              attestationQueue: queueWithReward.publicKey,
              receiver: payerTokenWallet,
            })
            .signers([verifier.signer, enclaveSigner])
            .rpc();

          let retryCount = 3;
          let finalRequestState =
            await switchboard.program.account.functionRequestAccountData.fetch(
              requestPubkey
            );
          while (
            retryCount > 0 &&
            finalRequestState.activeRequest.requestSlot.toNumber() === 0
          ) {
            await sleep(1000);
            finalRequestState =
              await switchboard.program.account.functionRequestAccountData.fetch(
                requestPubkey
              );
            retryCount--;
          }

          assert.equal(finalRequestState.errorStatus, errorCode);

          assert(
            finalRequestState.activeRequest.enclaveSigner.equals(
              PublicKey.default
            )
          );

          assert(
            finalRequestState.activeRequest.status.requestFailure !== undefined
          );

          const finalBalance = await switchboard.mint.getAssociatedBalance(
            requestPubkey
          );

          const requestCost = initialBalance - finalBalance;

          assert.equal(requestCost, expectedRequestCost);
        })
      );
    });
  });
});
