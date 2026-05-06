import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  // Replace with your project ref from cloud.trigger.dev → Project Settings
  project: "proj_ktaloogugxqneandrrso",
  dirs: ["./src/trigger"],
  maxDuration: 300, // 5 minutes max per run
});
