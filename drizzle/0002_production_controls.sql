CREATE TABLE `affinity_rate_limits` (
  `owner_id` text NOT NULL,
  `bucket` text NOT NULL,
  `window_started` integer NOT NULL,
  `request_count` integer NOT NULL DEFAULT 0,
  PRIMARY KEY (`owner_id`,`bucket`,`window_started`)
);
--> statement-breakpoint
CREATE INDEX `affinity_rate_limits_window_idx` ON `affinity_rate_limits` (`window_started`);
