import Joi from "joi";

const taskRequest = {
  body: Joi.object({
    api_key: Joi.string().optional().allow(null, ""),
    cluster: Joi.string()
      .valid("mainnet-beta", "devnet")
      .default("mainnet-beta")
      .optional(),
    task: Joi.object().required(),
    input: Joi.string().optional().allow(null, ""),
  }),
};

export default {
  taskRequest,
};
