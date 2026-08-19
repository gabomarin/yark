export type SteamCmdCardJobRef = {
  jobId: string;
  label: string;
  operation: "install-files" | "update" | "verify-files";
};
