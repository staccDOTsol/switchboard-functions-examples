/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import type {
  BaseContract,
  BigNumber,
  BigNumberish,
  BytesLike,
  CallOverrides,
  ContractTransaction,
  Overrides,
  PayableOverrides,
  PopulatedTransaction,
  Signer,
  utils,
} from "ethers";
import type {
  FunctionFragment,
  Result,
  EventFragment,
} from "@ethersproject/abi";
import type { Listener, Provider } from "@ethersproject/providers";
import type {
  TypedEventFilter,
  TypedEvent,
  TypedListener,
  OnEvent,
  PromiseOrValue,
} from "../../common";

export declare namespace FunctionCallLib {
  export type FunctionCallSettingsStruct = {
    requireEstimatedRunCostFee: PromiseOrValue<boolean>;
    minimumFee: PromiseOrValue<BigNumberish>;
    maxGasCost: PromiseOrValue<BigNumberish>;
    requireCallerPayFullCost: PromiseOrValue<boolean>;
    requireSenderBeReturnAddress: PromiseOrValue<boolean>;
  };

  export type FunctionCallSettingsStructOutput = [
    boolean,
    BigNumber,
    BigNumber,
    boolean,
    boolean
  ] & {
    requireEstimatedRunCostFee: boolean;
    minimumFee: BigNumber;
    maxGasCost: BigNumber;
    requireCallerPayFullCost: boolean;
    requireSenderBeReturnAddress: boolean;
  };

  export type FunctionCallStruct = {
    functionId: PromiseOrValue<string>;
    caller: PromiseOrValue<string>;
    timestamp: PromiseOrValue<BigNumberish>;
    callData: PromiseOrValue<BytesLike>;
    executed: PromiseOrValue<boolean>;
    consecutiveFailures: PromiseOrValue<BigNumberish>;
    feePaid: PromiseOrValue<BigNumberish>;
  };

  export type FunctionCallStructOutput = [
    string,
    string,
    BigNumber,
    string,
    boolean,
    BigNumber,
    BigNumber
  ] & {
    functionId: string;
    caller: string;
    timestamp: BigNumber;
    callData: string;
    executed: boolean;
    consecutiveFailures: BigNumber;
    feePaid: BigNumber;
  };
}

export interface FunctionCallInterface extends utils.Interface {
  functions: {
    "callFunction(address,bytes)": FunctionFragment;
    "functionCallSettings(address)": FunctionFragment;
    "functionCalls(address)": FunctionFragment;
    "getActiveFunctionCallsByQueue(address)": FunctionFragment;
    "setFunctionCallSettings(address,bool,uint256,uint256,bool,bool)": FunctionFragment;
  };

  getFunction(
    nameOrSignatureOrTopic:
      | "callFunction"
      | "functionCallSettings"
      | "functionCalls"
      | "getActiveFunctionCallsByQueue"
      | "setFunctionCallSettings"
  ): FunctionFragment;

  encodeFunctionData(
    functionFragment: "callFunction",
    values: [PromiseOrValue<string>, PromiseOrValue<BytesLike>]
  ): string;
  encodeFunctionData(
    functionFragment: "functionCallSettings",
    values: [PromiseOrValue<string>]
  ): string;
  encodeFunctionData(
    functionFragment: "functionCalls",
    values: [PromiseOrValue<string>]
  ): string;
  encodeFunctionData(
    functionFragment: "getActiveFunctionCallsByQueue",
    values: [PromiseOrValue<string>]
  ): string;
  encodeFunctionData(
    functionFragment: "setFunctionCallSettings",
    values: [
      PromiseOrValue<string>,
      PromiseOrValue<boolean>,
      PromiseOrValue<BigNumberish>,
      PromiseOrValue<BigNumberish>,
      PromiseOrValue<boolean>,
      PromiseOrValue<boolean>
    ]
  ): string;

  decodeFunctionResult(
    functionFragment: "callFunction",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "functionCallSettings",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "functionCalls",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getActiveFunctionCallsByQueue",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setFunctionCallSettings",
    data: BytesLike
  ): Result;

  events: {
    "FunctionCallEvent(address,address,address,bytes)": EventFragment;
    "FunctionCallFund(address,address,uint256)": EventFragment;
  };

  getEvent(nameOrSignatureOrTopic: "FunctionCallEvent"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "FunctionCallFund"): EventFragment;
}

export interface FunctionCallEventEventObject {
  functionId: string;
  sender: string;
  callId: string;
  params: string;
}
export type FunctionCallEventEvent = TypedEvent<
  [string, string, string, string],
  FunctionCallEventEventObject
>;

export type FunctionCallEventEventFilter =
  TypedEventFilter<FunctionCallEventEvent>;

export interface FunctionCallFundEventObject {
  functionId: string;
  funder: string;
  amount: BigNumber;
}
export type FunctionCallFundEvent = TypedEvent<
  [string, string, BigNumber],
  FunctionCallFundEventObject
>;

export type FunctionCallFundEventFilter =
  TypedEventFilter<FunctionCallFundEvent>;

export interface FunctionCall extends BaseContract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  interface: FunctionCallInterface;

  queryFilter<TEvent extends TypedEvent>(
    event: TypedEventFilter<TEvent>,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined
  ): Promise<Array<TEvent>>;

  listeners<TEvent extends TypedEvent>(
    eventFilter?: TypedEventFilter<TEvent>
  ): Array<TypedListener<TEvent>>;
  listeners(eventName?: string): Array<Listener>;
  removeAllListeners<TEvent extends TypedEvent>(
    eventFilter: TypedEventFilter<TEvent>
  ): this;
  removeAllListeners(eventName?: string): this;
  off: OnEvent<this>;
  on: OnEvent<this>;
  once: OnEvent<this>;
  removeListener: OnEvent<this>;

  functions: {
    callFunction(
      functionId: PromiseOrValue<string>,
      params: PromiseOrValue<BytesLike>,
      overrides?: PayableOverrides & { from?: PromiseOrValue<string> }
    ): Promise<ContractTransaction>;

    functionCallSettings(
      functionId: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<[FunctionCallLib.FunctionCallSettingsStructOutput]>;

    functionCalls(
      callId: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<[FunctionCallLib.FunctionCallStructOutput]>;

    getActiveFunctionCallsByQueue(
      queueId: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<[string[], FunctionCallLib.FunctionCallStructOutput[]]>;

    setFunctionCallSettings(
      functionId: PromiseOrValue<string>,
      requireEstimatedRunCostFee: PromiseOrValue<boolean>,
      minimumFee: PromiseOrValue<BigNumberish>,
      maxGasCost: PromiseOrValue<BigNumberish>,
      requireCallerPayFullCost: PromiseOrValue<boolean>,
      requireSenderBeReturnAddress: PromiseOrValue<boolean>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<ContractTransaction>;
  };

  callFunction(
    functionId: PromiseOrValue<string>,
    params: PromiseOrValue<BytesLike>,
    overrides?: PayableOverrides & { from?: PromiseOrValue<string> }
  ): Promise<ContractTransaction>;

  functionCallSettings(
    functionId: PromiseOrValue<string>,
    overrides?: CallOverrides
  ): Promise<FunctionCallLib.FunctionCallSettingsStructOutput>;

  functionCalls(
    callId: PromiseOrValue<string>,
    overrides?: CallOverrides
  ): Promise<FunctionCallLib.FunctionCallStructOutput>;

  getActiveFunctionCallsByQueue(
    queueId: PromiseOrValue<string>,
    overrides?: CallOverrides
  ): Promise<[string[], FunctionCallLib.FunctionCallStructOutput[]]>;

  setFunctionCallSettings(
    functionId: PromiseOrValue<string>,
    requireEstimatedRunCostFee: PromiseOrValue<boolean>,
    minimumFee: PromiseOrValue<BigNumberish>,
    maxGasCost: PromiseOrValue<BigNumberish>,
    requireCallerPayFullCost: PromiseOrValue<boolean>,
    requireSenderBeReturnAddress: PromiseOrValue<boolean>,
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): Promise<ContractTransaction>;

  callStatic: {
    callFunction(
      functionId: PromiseOrValue<string>,
      params: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<string>;

    functionCallSettings(
      functionId: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<FunctionCallLib.FunctionCallSettingsStructOutput>;

    functionCalls(
      callId: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<FunctionCallLib.FunctionCallStructOutput>;

    getActiveFunctionCallsByQueue(
      queueId: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<[string[], FunctionCallLib.FunctionCallStructOutput[]]>;

    setFunctionCallSettings(
      functionId: PromiseOrValue<string>,
      requireEstimatedRunCostFee: PromiseOrValue<boolean>,
      minimumFee: PromiseOrValue<BigNumberish>,
      maxGasCost: PromiseOrValue<BigNumberish>,
      requireCallerPayFullCost: PromiseOrValue<boolean>,
      requireSenderBeReturnAddress: PromiseOrValue<boolean>,
      overrides?: CallOverrides
    ): Promise<void>;
  };

  filters: {
    "FunctionCallEvent(address,address,address,bytes)"(
      functionId?: PromiseOrValue<string> | null,
      sender?: PromiseOrValue<string> | null,
      callId?: PromiseOrValue<string> | null,
      params?: null
    ): FunctionCallEventEventFilter;
    FunctionCallEvent(
      functionId?: PromiseOrValue<string> | null,
      sender?: PromiseOrValue<string> | null,
      callId?: PromiseOrValue<string> | null,
      params?: null
    ): FunctionCallEventEventFilter;

    "FunctionCallFund(address,address,uint256)"(
      functionId?: PromiseOrValue<string> | null,
      funder?: PromiseOrValue<string> | null,
      amount?: PromiseOrValue<BigNumberish> | null
    ): FunctionCallFundEventFilter;
    FunctionCallFund(
      functionId?: PromiseOrValue<string> | null,
      funder?: PromiseOrValue<string> | null,
      amount?: PromiseOrValue<BigNumberish> | null
    ): FunctionCallFundEventFilter;
  };

  estimateGas: {
    callFunction(
      functionId: PromiseOrValue<string>,
      params: PromiseOrValue<BytesLike>,
      overrides?: PayableOverrides & { from?: PromiseOrValue<string> }
    ): Promise<BigNumber>;

    functionCallSettings(
      functionId: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    functionCalls(
      callId: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getActiveFunctionCallsByQueue(
      queueId: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    setFunctionCallSettings(
      functionId: PromiseOrValue<string>,
      requireEstimatedRunCostFee: PromiseOrValue<boolean>,
      minimumFee: PromiseOrValue<BigNumberish>,
      maxGasCost: PromiseOrValue<BigNumberish>,
      requireCallerPayFullCost: PromiseOrValue<boolean>,
      requireSenderBeReturnAddress: PromiseOrValue<boolean>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<BigNumber>;
  };

  populateTransaction: {
    callFunction(
      functionId: PromiseOrValue<string>,
      params: PromiseOrValue<BytesLike>,
      overrides?: PayableOverrides & { from?: PromiseOrValue<string> }
    ): Promise<PopulatedTransaction>;

    functionCallSettings(
      functionId: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    functionCalls(
      callId: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    getActiveFunctionCallsByQueue(
      queueId: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    setFunctionCallSettings(
      functionId: PromiseOrValue<string>,
      requireEstimatedRunCostFee: PromiseOrValue<boolean>,
      minimumFee: PromiseOrValue<BigNumberish>,
      maxGasCost: PromiseOrValue<BigNumberish>,
      requireCallerPayFullCost: PromiseOrValue<boolean>,
      requireSenderBeReturnAddress: PromiseOrValue<boolean>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<PopulatedTransaction>;
  };
}
