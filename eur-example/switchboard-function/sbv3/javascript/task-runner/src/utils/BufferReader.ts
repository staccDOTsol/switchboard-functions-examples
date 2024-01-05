import * as borsh from "@coral-xyz/borsh";
import type { PublicKey } from "@solana/web3.js";
import { Big, BigUtils, BN, OracleJob } from "@switchboard-xyz/common";
import type { Layout } from "buffer-layout";

export class BufferReader {
  buffer: Buffer;

  constructor(buffer: Buffer) {
    this.buffer = buffer;
  }

  static fromString(str: string): BufferReader {
    const bytes: number[] = JSON.parse(str).data;
    const buffer = Buffer.from(bytes);
    return new BufferReader(buffer);
  }

  decode(bufferLayoutParseTask: OracleJob.BufferLayoutParseTask): Big | string {
    const { endian, offset, type } = bufferLayoutParseTask;

    const layout = getFieldLayout(bufferLayoutParseTask.type);
    const buffer: Buffer = this.buffer.slice(offset, offset + layout.span);
    if (!buffer.byteLength || buffer.byteLength !== layout.span) {
      throw new Error(
        `BufferParseError: Failed to slice buffer, len ${buffer.byteLength}, span ${layout.span}`
      );
    }

    switch (type) {
      case OracleJob.BufferLayoutParseTask.BufferParseType.bool: {
        const bool = (layout as Layout<boolean>).decode(buffer);
        return bool.toString();
      }
      case OracleJob.BufferLayoutParseTask.BufferParseType.pubkey: {
        const pubkey: PublicKey = (layout as Layout<PublicKey>).decode(buffer);
        return pubkey.toBase58();
      }
      case OracleJob.BufferLayoutParseTask.BufferParseType.u8:
      case OracleJob.BufferLayoutParseTask.BufferParseType.i8:
      case OracleJob.BufferLayoutParseTask.BufferParseType.u16:
      case OracleJob.BufferLayoutParseTask.BufferParseType.i16:
      case OracleJob.BufferLayoutParseTask.BufferParseType.u32:
      case OracleJob.BufferLayoutParseTask.BufferParseType.i32:
      case OracleJob.BufferLayoutParseTask.BufferParseType.f32:
      case OracleJob.BufferLayoutParseTask.BufferParseType.f64: {
        const buf =
          endian === OracleJob.BufferLayoutParseTask.Endian.LITTLE_ENDIAN
            ? buffer
            : buffer.reverse();
        const value: number = (layout as Layout<number>).decode(buf);
        return new Big(value);
      }
      case OracleJob.BufferLayoutParseTask.BufferParseType.u64:
      case OracleJob.BufferLayoutParseTask.BufferParseType.i64:
      case OracleJob.BufferLayoutParseTask.BufferParseType.u128:
      case OracleJob.BufferLayoutParseTask.BufferParseType.i128: {
        const value = new BN(
          buffer,
          10,
          endian === OracleJob.BufferLayoutParseTask.Endian.LITTLE_ENDIAN
            ? "le"
            : "be"
        );
        return BigUtils.fromBN(value);
      }
      default: {
        throw new Error(
          `No BufferParse method found for type ${bufferLayoutParseTask.type}`
        );
      }
    }
  }
}

export function getFieldLayout(
  bufferLayoutType: OracleJob.BufferLayoutParseTask.BufferParseType
): Layout<number | PublicKey | BN | boolean> {
  switch (bufferLayoutType) {
    case OracleJob.BufferLayoutParseTask.BufferParseType.bool: {
      return borsh.bool();
    }
    case OracleJob.BufferLayoutParseTask.BufferParseType.u8: {
      return borsh.u8();
    }
    case OracleJob.BufferLayoutParseTask.BufferParseType.i8: {
      return borsh.i8();
    }
    case OracleJob.BufferLayoutParseTask.BufferParseType.u16: {
      return borsh.u16();
    }
    case OracleJob.BufferLayoutParseTask.BufferParseType.i16: {
      return borsh.i16();
    }
    case OracleJob.BufferLayoutParseTask.BufferParseType.u32: {
      return borsh.u32();
    }
    case OracleJob.BufferLayoutParseTask.BufferParseType.i32: {
      return borsh.i32();
    }
    case OracleJob.BufferLayoutParseTask.BufferParseType.f32: {
      return borsh.f32();
    }
    case OracleJob.BufferLayoutParseTask.BufferParseType.u64: {
      return borsh.u64();
    }
    case OracleJob.BufferLayoutParseTask.BufferParseType.i64: {
      return borsh.i64();
    }
    case OracleJob.BufferLayoutParseTask.BufferParseType.f64: {
      return borsh.f64();
    }
    case OracleJob.BufferLayoutParseTask.BufferParseType.u128: {
      return borsh.u128();
    }
    case OracleJob.BufferLayoutParseTask.BufferParseType.i128: {
      return borsh.i128();
    }
    // case "bytes": {
    //   return borsh.vecU8();
    // }
    // case "string": {
    //   return borsh.str();
    // }
    case OracleJob.BufferLayoutParseTask.BufferParseType.pubkey: {
      return borsh.publicKey();
    }
    default:
      throw new Error(`BorshParse not supported for type ${bufferLayoutType}`);
  }
}
