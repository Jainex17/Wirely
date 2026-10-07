import {
  customType,
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
// No longer read. A project used to be one kind or the other; now every
// project has HTML pages in project_pages and, once used, a design canvas in
// project_documents, shown as two tabs of one editor. Drop the column once the
// code that stopped writing it is deployed everywhere.
export const projectKindEnum = pgEnum("project_kind", ["html", "design"]);
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
export const agentJobStatusEnum = pgEnum("agent_job_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
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
    localModelCatalog: jsonb("local_model_catalog").$type<string[]>(),
    localModelCatalogAt: timestamp("local_model_catalog_at", { withTimezone: true }),
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
    kind: projectKindEnum("kind").default("html").notNull(),
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

export const projectPrototypeFlows = pgTable(
  "project_prototype_flows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    pageIds: jsonb("page_ids").$type<string[]>().notNull(),
    startPageId: uuid("start_page_id").references(() => projectPages.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    projectUnique: uniqueIndex("project_prototype_flows_project_id_idx").on(
      table.projectId,
    ),
  }),
);

/**
 * A project's review link. One row means the link is on; deleting the row turns
 * it off, and a new row gets a new token. The token is stored in plain text so
 * the owner can copy the link again. It only grants read and comment access,
 * and only to signed-in users. Its own table, so projects queries keep working
 * on a database that has not run this migration yet.
 */
export const projectShares = pgTable(
  "project_shares",
  {
    projectId: uuid("project_id")
      .primaryKey()
      .references(() => projects.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tokenUnique: uniqueIndex("project_shares_token_idx").on(table.token),
  }),
);

// pg returns bytea as a Buffer and takes one as a parameter.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/**
 * An image the user or their agent uploaded to a project, for pages to use
 * through /api/assets/<id>. Bytes live here because the app has no file
 * storage; lib/projectAssets.ts caps their size and count.
 */
export const projectAssets = pgTable(
  "project_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index("project_assets_project_id_idx").on(table.projectId),
  }),
);

/** A comment pinned to a spot on a page, left through the review link. */
export const projectComments = pgTable(
  "project_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    pageId: uuid("page_id")
      .notNull()
      .references(() => projectPages.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    /** The element the comment is about, a `data-wirely-id`, or null for the whole page. */
    nodeId: text("node_id"),
    /** Page pixels from the top left of the page at its device width. */
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    projectCreatedIdx: index("project_comments_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  }),
);

/**
 * Per-project state shared with MCP agents. A table of its own rather than
 * columns on `projects`, so code that ships before this migration degrades
 * instead of breaking every `select()` from projects.
 */
export const projectAgentState = pgTable("project_agent_state", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  /** CSS custom properties written into every page, see `lib/designTokens.ts`. */
  designTokens: jsonb("design_tokens").$type<Record<string, string>>(),
  /** The page the user focused and the element they picked, for `get_selection`. */
  selectedPageId: uuid("selected_page_id"),
  selectedNodeId: text("selected_node_id"),
  selectedAt: timestamp("selected_at", { withTimezone: true }),
});

/**
 * The HTML an MCP agent last wrote to a page, so get_page_changes can tell it
 * what the user changed by hand since. Its own table so page queries keep
 * working on a database that has not run this migration yet.
 */
export const projectPageAgentBaselines = pgTable("project_page_agent_baselines", {
  pageId: uuid("page_id")
    .primaryKey()
    .references(() => projectPages.id, { onDelete: "cascade" }),
  htmlContent: text("html_content").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A page's HTML as it was before a write replaced it, so the user can restore
 * a design an agent overwrote. Writes within a few minutes of the last snapshot
 * share it, so a burst of patches leaves one restore point, not dozens.
 */
export const projectPageVersions = pgTable(
  "project_page_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => projectPages.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    htmlContent: text("html_content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pageCreatedIdx: index("project_page_versions_page_created_idx").on(
      table.pageId,
      table.createdAt,
    ),
  }),
);

/**
 * One MCP tool call an agent made against a project, for the sidebar's
 * activity tab. `pageId` has no foreign key so the row outlives a deleted page.
 */
export const projectAgentActivity = pgTable(
  "project_agent_activity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tool: text("tool").notNull(),
    pageId: uuid("page_id"),
    /** The error text an agent saw, or null when the call succeeded. */
    error: text("error"),
    /** What the call changed, from the agent's note or worked out from the call. */
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    projectCreatedIdx: index("project_agent_activity_project_created_idx").on(
      table.projectId,
      table.createdAt,
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

/**
 * Personal access tokens for the Wirely MCP server.
 *
 * Only the SHA-256 hash is stored, so a database read cannot recover a usable
 * token. `prefix` is the first few characters of the plaintext, kept purely so
 * the settings page can show the user which token is which.
 */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").default("Local agent").notNull(),
    tokenHash: text("token_hash").notNull(),
    prefix: text("prefix").notNull(),
    /** The OAuth client this token was issued to, when it came from the connect flow. */
    oauthClientId: uuid("oauth_client_id").references(() => oauthClients.id, {
      onDelete: "set null",
    }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("api_tokens_user_id_idx").on(table.userId),
    tokenHashUnique: uniqueIndex("api_tokens_token_hash_idx").on(table.tokenHash),
  }),
);

/**
 * One MCP client registered through OAuth dynamic client registration
 * (RFC 7591). Public clients: no secret, PKCE only. The stored redirect URIs
 * are the only ones an authorization or token request may name, compared by
 * exact string match — never by prefix.
 */
export const oauthClients = pgTable("oauth_clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A single-use OAuth authorization code, stored as its SHA-256 hash like the
 * tokens. A code lives for minutes and is consumed by the token exchange; the
 * atomic consume update refuses a second use, which is what makes a replayed
 * or intercepted code worthless without the client's PKCE verifier anyway.
 */
export const oauthAuthorizationCodes = pgTable(
  "oauth_authorization_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    codeHash: text("code_hash").notNull(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    codeHashUnique: uniqueIndex("oauth_authorization_codes_code_hash_idx").on(
      table.codeHash,
    ),
  }),
);

/**
 * Work queued for the removed local agent. Nothing reads or writes this table
 * any more, and neither the `users.local_model_catalog` columns. They stay
 * until a reviewed migration drops them from the live database.
 */
export const agentJobs = pgTable(
  "agent_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: agentJobStatusEnum("status").default("queued").notNull(),
    /** `provider/model` as opencode names it, e.g. `github-copilot/claude-opus-5`. */
    model: text("model"),
    variant: text("variant"),
    prompt: text("prompt").notNull(),
    /**
     * Set when the run edits one existing page instead of adding concepts.
     * The result overwrites this page rather than creating new ones.
     */
    targetPageId: uuid("target_page_id").references(() => projectPages.id, {
      onDelete: "cascade",
    }),
    /** Desktop or mobile, so a mobile brief does not save as a desktop frame. */
    deviceType: text("device_type").default("desktop").notNull(),
    /** How many screen concepts this job should return. */
    variantCount: integer("variant_count").default(1).notNull(),
    /** Raw assistant text, parsed server-side by the existing wireOutput pipeline. */
    resultText: text("result_text"),
    errorMessage: text("error_message"),
    /** Bumped each time the agent claims the row, to bound retries on a crash loop. */
    attempts: integer("attempts").default(0).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userStatusIdx: index("agent_jobs_user_status_idx").on(table.userId, table.status),
    projectIdx: index("agent_jobs_project_id_idx").on(table.projectId),
  }),
);

export type ProjectStatus = (typeof projectStatusEnum.enumValues)[number];
export type AgentJobStatus = (typeof agentJobStatusEnum.enumValues)[number];
export type ConversationRole = (typeof conversationRoleEnum.enumValues)[number];
export type GenerationMode = (typeof generationModeEnum.enumValues)[number];
export type GenerationRunStatus = (typeof generationRunStatusEnum.enumValues)[number];
export type GenerationOutputKind = (typeof generationOutputKindEnum.enumValues)[number];
export type GenerationOutputStatus =
  (typeof generationOutputStatusEnum.enumValues)[number];

/**
 * A project's design canvas: the whole scene as .fig bytes, the format the
 * design engine reads and writes. `version` goes up on every save, so a writer
 * that read an older version is refused instead of overwriting newer work.
 */
export const projectDocuments = pgTable("project_documents", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  data: bytea("data").notNull(),
  version: integer("version").default(1).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
