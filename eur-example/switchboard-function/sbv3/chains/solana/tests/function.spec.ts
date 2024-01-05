/* eslint-disable no-unused-vars */
import "mocha";

import type { SwitchboardAttestationProgram } from "../target/types/switchboard_attestation_program";

import { Switchboard } from "./utils/switchboard";
import { createFunction } from "./utils/utils";

import type { Program } from "@coral-xyz/anchor";
import { AnchorProvider } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import { sleep, toUtf8 } from "@switchboard-xyz/common";
import { parseRawBuffer } from "@switchboard-xyz/solana.js";
import assert from "assert";

describe("Function Tests", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;

  const _program: Program<SwitchboardAttestationProgram> =
    anchor.workspace.SwitchboardAttestationProgram;

  let switchboard: Switchboard<SwitchboardAttestationProgram>;

  before(async () => {
    switchboard = await Switchboard.initialize(_program);
  });

  /**
   * Test the function routine config parameters behave as expected
   * 1. Sets a function config and updates the name, container, version, etc
   * 2. Fails to set a name that exceeds 64 characters
   * 3. Fails to update routinesDisabled after its been locked
   *    - routinesDisabled cannot be updated after it has been locked
   */
  describe("Function Config", () => {
    let functionPubkey: PublicKey;

    before(async () => {
      [functionPubkey] = await createFunction(
        switchboard.program,
        switchboard.defaultQueue.publicKey,
        "FunctionConfigTests",
        {
          name: "MyFunction",
          metadata: "MyFunctionMetadata",
          container: "MyFunctionContainer",
          containerRegistry: "MyFunctionContainerRegistry",
          version: "MyFunctionVersion",
        }
      );
    });

    it("Updates a function's name, metadata, container, registry, and version", async () => {
      let functionState = await _program.account.functionAccountData.fetch(
        functionPubkey
      );

      let name = toUtf8(functionState.name);
      let metadata = toUtf8(functionState.metadata);
      let container = toUtf8(functionState.container);
      let containerRegistry = toUtf8(functionState.containerRegistry);
      let version = toUtf8(functionState.version);

      assert.equal(name, "MyFunction");
      assert.equal(metadata, "MyFunctionMetadata");
      assert.equal(container, "MyFunctionContainer");
      assert.equal(containerRegistry, "MyFunctionContainerRegistry");
      assert.equal(version, "MyFunctionVersion");

      const tx = await _program.methods
        .functionSetConfig({
          // Metadata Config
          name: Buffer.from("MyNewFunction"),
          metadata: Buffer.from("MyNewFunctionMetadata"),
          // Container Config
          container: Buffer.from("MyNewFunctionContainer"),
          containerRegistry: Buffer.from("MyNewFunctionContainerRegistry"),
          version: Buffer.from("MyNewFunctionVersion"),
          mrEnclaves: null,
          // Requests Config
          requestsDisabled: null,
          requestsRequireAuthorization: null,
          requestsDevFee: null,
          routinesDisabled: null,
          lockRoutinesDisabled: null,
          routinesRequireAuthorization: null,
          routinesDevFee: null,
        })
        .accounts({
          function: functionPubkey,
          authority: switchboard.payer.publicKey,
        })
        .rpc();

      functionState = await _program.account.functionAccountData.fetch(
        functionPubkey
      );

      name = toUtf8(functionState.name);
      metadata = toUtf8(functionState.metadata);
      container = toUtf8(functionState.container);
      containerRegistry = toUtf8(functionState.containerRegistry);
      version = toUtf8(functionState.version);

      assert.equal(name, "MyNewFunction");
      assert.equal(metadata, "MyNewFunctionMetadata");
      assert.equal(container, "MyNewFunctionContainer");
      assert.equal(containerRegistry, "MyNewFunctionContainerRegistry");
      assert.equal(version, "MyNewFunctionVersion");
    });

    it("Fails to set name if it exceeds 64 characters", async () => {
      await assert.rejects(async () => {
        await _program.methods
          .functionSetConfig({
            // Metadata Config
            name: Buffer.from(parseRawBuffer("NewNamePaddedWithZeros", 65)),
            metadata: null,
            // Container Config
            container: null,
            containerRegistry: null,
            version: null,
            mrEnclaves: null,
            // Requests Config
            requestsDisabled: null,
            requestsRequireAuthorization: null,
            requestsDevFee: null,
            routinesDisabled: null,
            lockRoutinesDisabled: null,
            routinesRequireAuthorization: null,
            routinesDevFee: null,
          })
          .accounts({
            function: functionPubkey,
            authority: switchboard.payer.publicKey,
          })
          .rpc();
      }, new RegExp("IllegalExecuteAttempt."));
    });

    it("Fails to update routinesDisabled after its been locked", async () => {
      await switchboard.program.methods
        .functionSetConfig({
          // Metadata Config
          name: null,
          metadata: null,
          // Container Config
          container: null,
          containerRegistry: null,
          version: null,
          mrEnclaves: null,
          // Requests Config
          requestsDisabled: null,
          requestsRequireAuthorization: null,
          requestsDevFee: null,
          // Routines Config
          routinesDisabled: true,
          lockRoutinesDisabled: true,
          routinesRequireAuthorization: null,
          routinesDevFee: null,
        })
        .accounts({
          function: functionPubkey,
          authority: switchboard.payer.publicKey,
        })
        .rpc();

      const finalFunctionState =
        await switchboard.program.account.functionAccountData.fetch(
          functionPubkey
        );

      assert(
        finalFunctionState.routinesDisabled.disabledLocked,
        "FunctionConfigMismatch"
      );

      // try to update the value after its locked
      await assert.rejects(async () => {
        const tx = await switchboard.program.methods
          .functionSetConfig({
            // Metadata Config
            name: null,
            metadata: null,
            // Container Config
            container: null,
            containerRegistry: null,
            version: null,
            mrEnclaves: null,
            // Requests Config
            requestsDisabled: null,
            requestsRequireAuthorization: null,
            requestsDevFee: null,
            // Routines Config
            routinesDisabled: true,
            lockRoutinesDisabled: null,
            routinesRequireAuthorization: null,
            routinesDevFee: null,
          })
          .accounts({
            function: functionPubkey,
            authority: switchboard.payer.publicKey,
          })
          .rpc();
      }, new RegExp("ConfigParameterLocked"));
    });
  });
});
