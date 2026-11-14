CREATE TABLE `affinity_active_model` (
  `singleton` integer PRIMARY KEY NOT NULL CHECK (`singleton` = 1),
  `artifact_json` text NOT NULL,
  `activated_at` text NOT NULL
);
