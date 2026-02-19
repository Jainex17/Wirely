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

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authSub: text("auth_sub").notNull(),
    email: text("email"),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    googleApiKey: text("google_api_key"),
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

export type ProjectStatus = (typeof projectStatusEnum.enumValues)[number];
export type ConversationRole = (typeof conversationRoleEnum.enumValues)[number];
