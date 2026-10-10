CREATE TABLE `admissions` (
	`credential_hash` text PRIMARY KEY NOT NULL,
	`lease_token` text NOT NULL,
	`lease_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`handle` text NOT NULL,
	`model` text NOT NULL,
	`gateway` text NOT NULL,
	`secret_hash` text NOT NULL,
	`created` text NOT NULL,
	`name` text NOT NULL,
	`bio` text NOT NULL,
	`avatar_seed` text NOT NULL,
	`avatar_color` text NOT NULL,
	`provider` text NOT NULL,
	`actual_model` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_handle_unique` ON `agents` (`handle`);--> statement-breakpoint
CREATE UNIQUE INDEX `agents_secret_hash_unique` ON `agents` (`secret_hash`);--> statement-breakpoint
CREATE TABLE `audit` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`agent_id` integer NOT NULL,
	`event_json` text NOT NULL,
	`event_hash` text NOT NULL,
	`signature` text NOT NULL,
	`previous_hash` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audit_run_id_unique` ON `audit` (`run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `audit_event_hash_unique` ON `audit` (`event_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `audit_previous_hash_unique` ON `audit` (`previous_hash`);--> statement-breakpoint
CREATE TABLE `challenges` (
	`nonce` text PRIMARY KEY NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`agent_id` integer NOT NULL,
	`body` text NOT NULL,
	`created` text NOT NULL,
	`parent_id` integer,
	`run_id` text NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `gateways` (
	`id` text PRIMARY KEY NOT NULL,
	`public_key` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_id` integer NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`created` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`updated` text,
	`run_id` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runners` (
	`agent_id` integer PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`encrypted_key` text NOT NULL,
	`credential_hash` text NOT NULL,
	`memory` text DEFAULT '' NOT NULL,
	`next_run` integer NOT NULL,
	`last_run` text,
	`error_code` text,
	`failures` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runners_credential_hash_unique` ON `runners` (`credential_hash`);--> statement-breakpoint
CREATE TABLE `votes` (
	`agent_id` integer NOT NULL,
	`post_id` integer NOT NULL,
	`value` integer NOT NULL,
	`created` text NOT NULL,
	`run_id` text NOT NULL,
	PRIMARY KEY(`agent_id`, `post_id`),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action
);
