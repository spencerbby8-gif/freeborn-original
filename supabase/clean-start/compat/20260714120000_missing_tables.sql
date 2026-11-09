-- PREVIEW COMPATIBILITY BASELINE ONLY. Not recovered production migration SQL.

begin;

CREATE TABLE IF NOT EXISTS public."account_deletion_requests" (

	"account_id" uuid PRIMARY KEY NOT NULL,
	"status_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'cleanup_pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"relational_deleted_at" timestamp with time zone,
	"storage_completed_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "account_deletion_requests_status_token_unique" UNIQUE("status_token"),
	CONSTRAINT "account_deletion_requests_status_check" CHECK ("account_deletion_requests"."status" in ('cleanup_pending','completed','cleanup_failed')),
	CONSTRAINT "account_deletion_requests_completed_has_time" CHECK ("account_deletion_requests"."status" <> 'completed' or "account_deletion_requests"."storage_completed_at" is not null)

);

CREATE TABLE IF NOT EXISTS public."account_devices" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_hash" char(16) NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
	"seen_count" integer DEFAULT 1 NOT NULL,
	"install_age_ms" bigint

);

CREATE TABLE IF NOT EXISTS public."appeals" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"detail" text NOT NULL,
	"status" text DEFAULT 'under_review' NOT NULL,
	"verdict" text,
	"investigation" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL

);

CREATE TABLE IF NOT EXISTS public."call_sessions" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"caller_id" uuid NOT NULL,
	"callee_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'ringing' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "call_sessions_kind_check" CHECK ("call_sessions"."kind" in ('voice','video')),
	CONSTRAINT "call_sessions_status_check" CHECK ("call_sessions"."status" in ('ringing','active','ended')),
	CONSTRAINT "call_sessions_distinct_members" CHECK ("call_sessions"."caller_id" <> "call_sessions"."callee_id"),
	CONSTRAINT "call_sessions_ended_has_time" CHECK ("call_sessions"."status" <> 'ended' or "call_sessions"."ended_at" is not null)

);

CREATE TABLE IF NOT EXISTS public."chat_media" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" uuid,
	"match_id" uuid,
	"kind" text DEFAULT 'voice' NOT NULL,
	"mime" text DEFAULT 'application/octet-stream' NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
	CONSTRAINT "chat_media_kind_check" CHECK ("chat_media"."kind" in ('image','video','voice'))

);

CREATE TABLE IF NOT EXISTS public."chat_signals" (

	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "chat_signals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"match_id" uuid NOT NULL,
	"kind" text DEFAULT 'message' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_signals_kind_check" CHECK ("kind" in ('message', 'typing', 'severed', 'cleared'))

);

CREATE TABLE IF NOT EXISTS public."enforcement_cases" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" "citext",
	"tier" text NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"violated_class" text NOT NULL,
	"code" text NOT NULL,
	"detail" text,
	"notes" text,
	"trust_delta" integer DEFAULT 0 NOT NULL,
	"resolution" text,
	"opened_by" text NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
	CONSTRAINT "enforcement_cases_tier_check" CHECK ("enforcement_cases"."tier" in ('warning','suppression','suspension','ban')),
	CONSTRAINT "enforcement_cases_state_check" CHECK ("enforcement_cases"."state" in ('open','in_review','acknowledged','appealable','resolved')),
	CONSTRAINT "enforcement_cases_class_check" CHECK ("enforcement_cases"."violated_class" in ('violation_personal_content','violation_profile_content','violation_media','violation_behavior','violation_identity')),
	CONSTRAINT "enforcement_cases_resolution_check" CHECK ("enforcement_cases"."resolution" is null or "enforcement_cases"."resolution" in ('denied','warning_removed','content_reinstated','suppression_removed','suspension_removed','ban_removed')),
	CONSTRAINT "enforcement_cases_actor_check" CHECK ("enforcement_cases"."opened_by" in ('system','identity_engine','moderation_engine','operator','member_report'))

);

CREATE TABLE IF NOT EXISTS public."event_interests" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"city" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
	CONSTRAINT "event_interests_user_unique" UNIQUE("user_id")

);

CREATE TABLE IF NOT EXISTS public."human_challenges" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" char(16) NOT NULL,
	"nonce" text NOT NULL,
	"difficulty_bits" integer DEFAULT 20 NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"issued_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
	"expires_at" timestamp with time zone DEFAULT timezone('utc', now()) + interval '15 minutes' NOT NULL,
	"solved_at" timestamp with time zone,
	CONSTRAINT "human_challenges_nonce_unique" UNIQUE("nonce"),
	CONSTRAINT "human_challenges_purpose_check" CHECK ("human_challenges"."purpose" in ('appeal','signup','reset','verification')),
	CONSTRAINT "human_challenges_status_check" CHECK ("human_challenges"."status" in ('issued','solved','failed','expired'))

);

CREATE TABLE IF NOT EXISTS public."identity_fingerprints" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"photo_dhash" char(16),
	"photo_ahash" char(16),
	"anchor" char(16) NOT NULL,
	"selfie_check_id" uuid,
	"engine_decision" text,
	"engine_confidence" text,
	"created_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
	CONSTRAINT "identity_fingerprints_source_check" CHECK ("identity_fingerprints"."source" in ('verification','photo_upload','backfill')),
	CONSTRAINT "identity_fingerprints_decision_check" CHECK ("identity_fingerprints"."engine_decision" is null or "identity_fingerprints"."engine_decision" in ('match','mismatch','unclear')),
	CONSTRAINT "identity_fingerprints_confidence_check" CHECK ("identity_fingerprints"."engine_confidence" is null or "identity_fingerprints"."engine_confidence" in ('high','medium','low','unknown'))

);

CREATE TABLE IF NOT EXISTS public."matches" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_a" uuid NOT NULL,
	"user_b" uuid NOT NULL,
	"initiated_by" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"unmatched_by" uuid,
	"unmatched_at" timestamp with time zone,
	"unmatch_reason" text,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
	CONSTRAINT "matches_pair_unique" UNIQUE("user_a","user_b"),
	CONSTRAINT "matches_no_self" CHECK ("matches"."user_a" <> "matches"."user_b"),
	CONSTRAINT "matches_ordered" CHECK ("matches"."user_a" < "matches"."user_b"),
	CONSTRAINT "matches_status_check" CHECK ("matches"."status" in ('active','archived','blocked','unmatched')),
	CONSTRAINT "matches_unmatch_reason_check" CHECK ("matches"."unmatch_reason" is null or "matches"."unmatch_reason" in ('not_interested','met_someone','moved_off_app','inappropriate','safety','other')),
	CONSTRAINT "matches_unmatched_has_actor" CHECK ("matches"."status" <> 'unmatched' or ("matches"."unmatched_by" is not null and "matches"."unmatched_at" is not null))

);

CREATE TABLE IF NOT EXISTS public."message_reactions" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
	CONSTRAINT "message_reactions_unique" UNIQUE("message_id","user_id","emoji")

);

CREATE TABLE IF NOT EXISTS public."messages" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"flagged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
	CONSTRAINT "messages_body_length" CHECK (char_length("messages"."body") between 1 and 2000)

);

CREATE TABLE IF NOT EXISTS public."mixer_venues" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city" text NOT NULL,
	"venue_name" text NOT NULL,
	"consent_given_by" text NOT NULL,
	"consent_method" text NOT NULL,
	"consent_note" text NOT NULL,
	"consent_recorded_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
	"consent_withdrawn_at" timestamp with time zone

);

CREATE TABLE IF NOT EXISTS public."moderation_actions" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" uuid,
	"subject_email" text,
	"reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL

);

CREATE TABLE IF NOT EXISTS public."reports" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid,
	"subject_id" uuid,
	"reason" text DEFAULT 'other' NOT NULL,
	"details" text,
	"status" text DEFAULT 'open' NOT NULL,
	"origin" text DEFAULT 'member' NOT NULL,
	"severity" text,
	"triage_summary" text,
	"triage" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
	CONSTRAINT "reports_reason_check" CHECK ("reports"."reason" in ('fake_profile','scam','harassment','safety','underage','inappropriate_media','ai_generated_media','other','inappropriate_content','spam','nudity','violence','selfie_mismatch')),
	CONSTRAINT "reports_origin_check" CHECK ("reports"."origin" in ('member','identity_gate'))

);

CREATE TABLE IF NOT EXISTS public."security_events" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"ip" text,
	"kind" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL

);

CREATE TABLE IF NOT EXISTS public."sessions" (

	"token" text PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL

);

CREATE TABLE IF NOT EXISTS public."storage_cleanup_jobs" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deletion_account_id" uuid NOT NULL,
	"bucket" text NOT NULL,
	"owner_prefix" text NOT NULL,
	"object_paths" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "storage_cleanup_jobs_one_bucket_per_account" UNIQUE("deletion_account_id","bucket"),
	CONSTRAINT "storage_cleanup_jobs_bucket_check" CHECK ("storage_cleanup_jobs"."bucket" in ('profile-photos','verification-selfies')),
	CONSTRAINT "storage_cleanup_jobs_owner_prefix" CHECK ("storage_cleanup_jobs"."owner_prefix" = "storage_cleanup_jobs"."deletion_account_id"::text || '/'),
	CONSTRAINT "storage_cleanup_jobs_status_check" CHECK ("storage_cleanup_jobs"."status" in ('pending','processing','completed','failed')),
	CONSTRAINT "storage_cleanup_jobs_attempts_check" CHECK ("storage_cleanup_jobs"."attempts" >= 0),
	CONSTRAINT "storage_cleanup_jobs_max_attempts_check" CHECK ("storage_cleanup_jobs"."max_attempts" between 1 and 20),
	CONSTRAINT "storage_cleanup_jobs_processing_has_lease" CHECK ("storage_cleanup_jobs"."status" <> 'processing' or ("storage_cleanup_jobs"."lease_token" is not null and "storage_cleanup_jobs"."lease_expires_at" is not null)),
	CONSTRAINT "storage_cleanup_jobs_completed_has_time" CHECK ("storage_cleanup_jobs"."status" <> 'completed' or "storage_cleanup_jobs"."completed_at" is not null)

);

CREATE TABLE IF NOT EXISTS public."support_requests" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"message" text NOT NULL,
	"email" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL

);

CREATE TABLE IF NOT EXISTS public."suspensions" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"ip" text,
	"reason" text DEFAULT 'privacy_policy' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"lifted_at" timestamp with time zone,
	"lifted_by" text,
	"lift_note" text,
	"created_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL

);

CREATE TABLE IF NOT EXISTS public."verification_requests" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"method" text DEFAULT 'selfie' NOT NULL,
	"selfie_media" text,
	"selfie_storage_path" text,
	"reject_reason" text,
	"submitted_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "verification_status_check" CHECK ("verification_requests"."status" in ('pending','approved','rejected'))

);

CREATE TABLE IF NOT EXISTS public."warnings" (

	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"kind" text DEFAULT 'behavior' NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL

);

commit;
