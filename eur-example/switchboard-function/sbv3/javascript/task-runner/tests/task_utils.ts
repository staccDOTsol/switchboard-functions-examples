import { OracleJob } from "@switchboard-xyz/common";

export const getValueTask = (value: number) =>
  OracleJob.Task.create({
    valueTask: {
      value: value,
    },
  });
