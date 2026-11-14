CREATE TABLE `affinity_content_items` (
  `content_id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `category` text NOT NULL,
  `description` text NOT NULL,
  `quality_score` real NOT NULL,
  `published_at` text NOT NULL,
  `status` text NOT NULL DEFAULT 'active',
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `affinity_content_status_published_idx` ON `affinity_content_items` (`status`,`published_at`);
