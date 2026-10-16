const defaultBaseUrl = "https://integrate.api.nvidia.com/v1";
const defaultModel = "deepseek-ai/deepseek-v4.1-flash";

export const nvidiaNimConfig = {
  get apiKey() {
    return process.env.NVIDIA_NIM_API_KEY;
  },
  get baseUrl() {
    return (process.env.NVIDIA_NIM_BASE_URL ?? defaultBaseUrl).replace(/\/+$/, "");
  },
  get model() {
    return process.env.NVIDIA_NIM_MODEL ?? defaultModel;
  },
};
