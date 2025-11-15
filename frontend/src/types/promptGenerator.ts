export interface PromptGeneratorOptions {
  hook_type: string[];
  pain_point: string[];
  tone: string[];
  visual_style: string[];
  character_type: string[];
  character_vibe: string[];
  group_context: string[];
  problem_context: string[];
  emotion_first_3_seconds: string[];
  platform: string[];
  transition_type: string[];
  ad_length: number[];
}

export const PROMPT_OPTIONS: PromptGeneratorOptions = {
  hook_type: [
    "relatable_pain_point",
    "bold_claim",
    "pattern_interrupt",
    "did_you_know_fact",
    "humor_skit",
    "emotional_cold_open",
    "mystery_setup",
    "challenge_or_question",
    "visual_surprise",
    "story_minidrama"
  ],
  pain_point: [
    "stress_or_overwhelm",
    "lack_of_time",
    "boring_repetitive_days",
    "low_energy_or_fatigue",
    "feeling_behind_or_inadequate",
    "complicated_current_solutions",
    "need_for_mental_escape",
    "needing_focus_or_clarity",
    "wanting_authenticity_or_tradition",
    "decision_fatigue",
    "wanting_to_feel_attractive"
  ],
  tone: [
    "calm",
    "serious",
    "lighthearted",
    "humorous",
    "dramatic",
    "gritty",
    "aspirational",
    "friendly",
    "moody",
    "energetic",
    "seductive",
    "sensual"
  ],
  visual_style: [
    "cinematic",
    "ugc_handheld",
    "animated",
    "text_only",
    "voiceover_over_visuals",
    "pov_style",
    "slow_motion",
    "grainy_documentary",
    "clean_minimalist",
    "fast_cut_social",
    "glamorous"
  ],
  character_type: [
    "everyday_consumer",
    "working_professional",
    "parent",
    "student",
    "athlete",
    "creator_or_influencer",
    "no_character",
    "blue_collar_worker",
    "outdoors_person"
  ],
  character_vibe: [
    "calm",
    "chaotic",
    "sarcastic",
    "confident",
    "tired",
    "nostalgic",
    "quirky",
    "serious",
    "adventurous",
    "relatable",
    "sexy",
    "sultry",
    "seductive"
  ],
  group_context: [
    "friend_group",
    "family",
    "couple",
    "coworkers",
    "roommates",
    "siblings"
  ],
  problem_context: [
    "morning_rush",
    "long_workday",
    "stuck_in_traffic",
    "never_ending_meetings",
    "scrolling_endlessly",
    "messy_household_chaos",
    "late_night_exhaustion",
    "outdoors_moment_of_quiet",
    "garage_or_workshop_break",
    "after_work_unwind"
  ],
  emotion_first_3_seconds: [
    "surprise",
    "curiosity",
    "relief",
    "excitement",
    "empathy",
    "urgency",
    "calm",
    "humor",
    "nostalgia",
    "intrigue"
  ],
  platform: [
    "tiktok",
    "instagram_reels",
    "youtube",
    "linkedin",
    "facebook",
    "x_twitter",
    "website_hero",
    "snapchat",
    "youtube_shorts",
    "generic_social"
  ],
  transition_type: [
    "hard_cut",
    "soft_fade",
    "match_cut",
    "zoom_into_product",
    "text_overlay_transition",
    "actor_points_to_product",
    "comedic_punchline_cut",
    "dramatic_pause_then_cut",
    "quick_flash",
    "pan_to_black"
  ],
  ad_length: [4, 6, 8]
};

export interface PromptSelections {
  product?: string;
  hook_type?: string;
  pain_point?: string;
  tone?: string;
  visual_style?: string;
  character_type?: string;
  character_vibe?: string;
  group_context?: string;
  problem_context?: string;
  emotion_first_3_seconds?: string;
  platform?: string;
  transition_type?: string;
  ad_length: number; // Required - most important for video generation
}
