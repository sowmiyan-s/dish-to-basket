const defaultBaseUrl = "https://integrate.api.nvidia.com/v1";
const defaultModel = "meta/llama-3.1-8b-instruct";

export const nvidiaNimConfig = {
  apiKey: process.env.NVIDIA_NIM_API_KEY,
  baseUrl: (process.env.NVIDIA_NIM_BASE_URL ?? defaultBaseUrl).replace(/\/+$/, ""),
  model: process.env.NVIDIA_NIM_MODEL ?? defaultModel,
};
