import type { Account } from "near-api-js";

export const getAccessKeys = async (programId: string, account: Account) => {
  const allAccessKeys = await account.getAccessKeys();
  const sbv2AccessKeys = allAccessKeys.filter((key) => {
    if (
      key.access_key.permission !== "FullAccess" &&
      key.access_key.permission.FunctionCall.receiver_id === programId
    ) {
      return true;
    }
    return false;
  });
  return sbv2AccessKeys.map((accessKey) => accessKey.public_key);
};

export const deleteAccessKeys = async (programId: string, account: Account) => {
  const allAccessKeys = await account.getAccessKeys();
  const sbv2AccessKeys = allAccessKeys.filter((key) => {
    if (
      key.access_key.permission !== "FullAccess" &&
      key.access_key.permission.FunctionCall.receiver_id === programId
    ) {
      return true;
    }
    return false;
  });
  await Promise.all(
    sbv2AccessKeys.map(async (key) => await account.deleteKey(key.public_key))
  );
};
