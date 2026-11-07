// apiService.js – creates a singleton instance of HofisApiService and puts it on window
import { HofisApiService } from "./api.js";

export const apiService = new HofisApiService();

// Expose globally for legacy code (e.g., app.js uses window.apiService)
if (typeof window !== "undefined") {
  window.apiService = apiService;
}

