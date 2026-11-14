CREATE TABLE `affinity_events` (
  `event_id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `user_id` text NOT NULL,
  `content_id` text,
  `event_type` text NOT NULL,
  `timestamp` text NOT NULL,
  `session_id` text NOT NULL,
  `context_json` text NOT NULL DEFAULT '{}',
  `surface` text NOT NULL,
  `schema_version` integer NOT NULL DEFAULT 1
);
--> statement-breakpoint
CREATE INDEX `affinity_events_owner_user_time_idx` ON `affinity_events` (`owner_id`,`user_id`,`timestamp`);
--> statement-breakpoint
CREATE TABLE `affinity_stats` (
  `owner_id` text NOT NULL,
  `key` text NOT NULL,
  `value` integer NOT NULL DEFAULT 0,
  PRIMARY KEY (`owner_id`,`key`)
);
