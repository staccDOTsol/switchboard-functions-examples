import Joi from "joi";

const simulateRequest = {
  body: Joi.object({
    api_key: Joi.string().optional().allow(null, ""),
    cluster: Joi.string()
      .valid("mainnet-beta", "devnet")
      .default("mainnet-beta")
      .optional(),
    jobs: Joi.array().min(1).required(),
  }),
};

export default {
  simulateRequest,
};
