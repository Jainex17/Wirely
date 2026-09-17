import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const projectStatusEnum = pgEnum("project_status", ["active", "archived"]);
export const conversationRoleEnum = pgEnum("conversation_role", [
  "system",
  "user",
  "assistant",
]);
export const generationModeEnum = pgEnum("generation_mode", [
  "single_page",
  "concept_variants",
  "information_architecture",
]);
export const generationRunStatusEnum = pgEnum("generation_run_status", [
  "planning",
  "planned",
  "generating",
  "repairing",
  "completed",
  "partially_completed",
  "failed",
]);
export const generationOutputKindEnum = pgEnum("generation_output_kind", [
  "page",
  "concept",
]);
export const generationOutputStatusEnum = pgEnum("generation_output_status", [
  "planned",
  "generating",
  "repairing",
  "completed",
  "failed",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authSub: text("auth_sub").notNull(),
    email: text("email"),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    googleApiKeyCiphertext: text("google_api_key_ciphertext"),
    googleApiKeyIv: text("google_api_key_iv"),
    // Legacy column name kept for compatibility; stores AES-GCM auth tag.
    googleApiKeyHmac: text("google_api_key_hmac"),
    googleApiKeyKeyVersion: integer("google_api_key_key_version"),
    openRouterApiKeyCiphertext: text("openrouter_api_key_ciphertext"),
    openRouterApiKeyIv: text("openrouter_api_key_iv"),
    // Legacy column name kept for compatibility; stores AES-GCM auth tag.
    openRouterApiKeyHmac: text("openrouter_api_key_hmac"),
    openRouterApiKeyKeyVersion: integer("openrouter_api_key_key_version"),
    zaiApiKeyCiphertext: text("zai_api_key_ciphertext"),
    zaiApiKeyIv: text("zai_api_key_iv"),
    // Legacy column name kept for compatibility; stores AES-GCM auth tag.
    zaiApiKeyHmac: text("zai_api_key_hmac"),
    zaiApiKeyKeyVersion: integer("zai_api_key_key_version"),
    unsplashApiKeyCiphertext: text("unsplash_api_key_ciphertext"),
    unsplashApiKeyIv: text("unsplash_api_key_iv"),
    // Legacy column name kept for compatibility; stores AES-GCM auth tag.
    unsplashApiKeyHmac: text("unsplash_api_key_hmac"),
    unsplashApiKeyKeyVersion: integer("unsplash_api_key_key_version"),
    enabledGoogleModels: jsonb("enabled_google_models").$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    authSubUnique: uniqueIndex("users_auth_sub_idx").on(table.authSub),
    emailIdx: index("users_email_idx").on(table.email),
  }),
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: projectStatusEnum("status").default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("projects_user_id_idx").on(table.userId),
  }),
);

export const projectPages = pgTable(
  "project_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    htmlContent: text("html_content").default("").notNull(),
    deviceType: text("device_type").default("desktop").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index("project_pages_project_id_idx").on(table.projectId),
    projectSortIdx: index("project_pages_project_sort_idx").on(
      table.projectId,
      table.sortOrder,
    ),
  }),
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    projectUnique: uniqueIndex("conversations_project_id_idx").on(table.projectId),
  }),
);

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: conversationRoleEnum("role").notNull(),
    content: text("content").notNull(),
    planningSummary: text("planning_summary"),
    selectedModelName: text("selected_model_name"),
    plannerModelName: text("planner_model_name"),
    criticModelName: text("critic_model_name"),
    targetPageId: uuid("target_page_id").references(() => projectPages.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    conversationIdx: index("conversation_messages_conversation_id_idx").on(
      table.conversationId,
    ),
    targetPageIdx: index("conversation_messages_target_page_id_idx").on(
      table.targetPageId,
    ),
  }),
);

export const generationRuns = pgTable(
  "generation_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    selectedModelName: text("selected_model_name").notNull(),
    plannerModelName: text("planner_model_name").notNull(),
    criticModelName: text("critic_model_name").notNull(),
    generationMode: generationModeEnum("generation_mode"),
    status: generationRunStatusEnum("status").default("planning").notNull(),
    stageStatus: text("stage_status").default("planning").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index("generation_runs_project_id_idx").on(table.projectId),
    projectCreatedIdx: index("generation_runs_project_created_at_idx").on(
      table.projectId,
      table.createdAt,
    ),
  }),
);

export const generationOutputs = pgTable(
  "generation_outputs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    generationRunId: uuid("generation_run_id")
      .notNull()
      .references(() => generationRuns.id, { onDelete: "cascade" }),
    targetPageId: uuid("target_page_id").references(() => projectPages.id, {
      onDelete: "set null",
    }),
    outputIndex: integer("output_index").notNull(),
    outputKind: generationOutputKindEnum("output_kind").notNull(),
    title: text("title").notNull(),
    planJson: jsonb("plan_json").$type<Record<string, unknown>>().notNull(),
    critiqueJson: jsonb("critique_json").$type<Record<string, unknown>>(),
    details: text("details"),
    qualityScore: integer("quality_score"),
    status: generationOutputStatusEnum("status").default("planned").notNull(),
    htmlSnapshot: text("html_snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    runIdx: index("generation_outputs_generation_run_id_idx").on(table.generationRunId),
    targetPageIdx: index("generation_outputs_target_page_id_idx").on(table.targetPageId),
    runOutputUnique: uniqueIndex("generation_outputs_run_output_index_idx").on(
      table.generationRunId,
      table.outputIndex,
    ),
  }),
);

export type ProjectStatus = (typeof projectStatusEnum.enumValues)[number];
export type ConversationRole = (typeof conversationRoleEnum.enumValues)[number];
export type GenerationMode = (typeof generationModeEnum.enumValues)[number];
export type GenerationRunStatus = (typeof generationRunStatusEnum.enumValues)[number];
export type GenerationOutputKind = (typeof generationOutputKindEnum.enumValues)[number];
export type GenerationOutputStatus =
  (typeof generationOutputStatusEnum.enumValues)[number];
