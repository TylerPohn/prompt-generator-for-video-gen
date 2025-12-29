export interface PromptGeneratorOptions {
  hook_type: string[];
  pain_point: string[];
  tone: string[];
  visual_style: string[];
  // character_type: string[]; // Removed - not furniture-specific
  // character_vibe: string[]; // Removed - not furniture-specific
  // character_perception: string[]; // Removed - not furniture-specific
  // group_context: string[]; // Removed - not furniture-specific
  problem_context: string[];
  emotion_first_3_seconds: string[];
  platform: string[];
  transition_type: string[];
  ad_length: number[];
  furniture_style: string[];
  brand_voice: string[];
  product_category: string[];
  room_setting: string[];
  furniture_material: string[];
  furniture_benefit: string[];
  product_highlights: string[];
  environment_style: string[];
  people_in_scene: string[];
  lifestyle_context: string[];
}

export const PROMPT_OPTIONS: PromptGeneratorOptions = {
  hook_type: [
    "transform_your_space",
    "comfort_statement",
    "style_upgrade",
    "space_solution",
    "quality_reveal",
    "price_reveal",
    "trending_design",
    "problem_solver",
    "room_makeover",
    "investment_piece"
  ],
  pain_point: [
    "uncomfortable_seating",
    "cluttered_space",
    "poor_storage",
    "outdated_style",
    "limited_space",
    "hard_to_clean",
    "not_durable",
    "expensive",
    "difficult_assembly",
    "doesnt_match_decor"
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
    "product_focus",
    "lifestyle_shot",
    "room_reveal",
    "detail_closeup",
    "before_after",
    "360_view",
    "flat_lay",
    "in_situ",
    "lifestyle_vignette",
    "catalog_style"
  ],
  // character_type: [
  //   "everyday_consumer",
  //   "working_professional",
  //   "parent",
  //   "student",
  //   "athlete",
  //   "creator_or_influencer",
  //   "no_character",
  //   "blue_collar_worker",
  //   "outdoors_person"
  // ],
  // character_vibe: [
  //   "calm",
  //   "chaotic",
  //   "sarcastic",
  //   "confident",
  //   "tired",
  //   "nostalgic",
  //   "quirky",
  //   "serious",
  //   "adventurous",
  //   "relatable",
  //   "sexy",
  //   "sultry",
  //   "seductive"
  // ],
  // character_perception: [
  //   "envied",
  //   "wanted",
  //   "desired",
  //   "admired",
  //   "respected",
  //   "feared",
  //   "trusted",
  //   "loved",
  //   "misunderstood",
  //   "overlooked",
  //   "celebrated",
  //   "pitied",
  //   "revered",
  //   "aspirational"
  // ],
  // group_context: [
  //   "friend_group",
  //   "family",
  //   "couple",
  //   "coworkers",
  //   "roommates",
  //   "siblings"
  // ],
  problem_context: [
    "moving_into_new_home",
    "redecorating",
    "downsizing",
    "growing_family",
    "home_office_setup",
    "small_apartment",
    "seasonal_refresh",
    "furniture_broke",
    "style_refresh",
    "gift_shopping"
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
    "room_reveal",
    "zoom_to_detail",
    "pan_across",
    "soft_fade",
    "before_after_swipe",
    "lifestyle_to_product",
    "rotate_reveal",
    "pull_back",
    "close_to_wide",
    "drawer_open"
  ],
  ad_length: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  furniture_style: [
    "modern",
    "mid_century_modern",
    "minimalist",
    "scandinavian",
    "luxury_high_end",
    "rustic",
    "industrial",
    "antique_vintage",
    "eclectic_artistic",
    "office_functional",
    "classic_traditional",
    "contemporary"
  ],
  brand_voice: [
    "sophisticated",
    "warm_inviting",
    "artistic",
    "functional_practical",
    "playful",
    "neutral_clean",
    "luxurious",
    "casual_friendly",
    "professional",
    "cozy"
  ],
  product_category: [
    "sofa_sectional",
    "dining_table",
    "chair_seating",
    "bed_bedroom_set",
    "office_desk",
    "storage_shelves",
    "accent_furniture",
    "outdoor_furniture",
    "coffee_table",
    "nightstand",
    "dresser",
    "bookshelf"
  ],
  room_setting: [
    "living_room",
    "bedroom",
    "dining_room",
    "office",
    "kitchen",
    "outdoor",
    "entryway",
    "bathroom",
    "kids_room",
    "home_theater",
    "bar"
  ],
  furniture_material: [
    "leather",
    "velvet",
    "cotton",
    "oak",
    "walnut",
    "bamboo",
    "metal",
    "plastic",
    "glass",
    "rattan",
    "marble",
    "linen",
    "wood_general",
    "mixed_materials"
  ],
  furniture_benefit: [
    "space_saving",
    "comfort",
    "durability",
    "style",
    "versatility",
    "storage",
    "ergonomic",
    "easy_assembly",
    "sustainable"
  ],
  product_highlights: [
    "handcrafted",
    "new_arrival",
    "best_seller",
    "customizable_sizes",
    "sustainable_materials",
    "space_saving_design",
    "ergonomic_design",
    "pet_friendly",
    "locally_made",
    "limited_edition",
    "eco_friendly",
    "easy_care"
  ],
  environment_style: [
    "modern_loft",
    "cozy_home",
    "luxury_living_room",
    "minimalist_white_studio",
    "rustic_cabin_interior",
    "urban_apartment",
    "outdoor_patio_scene",
    "commercial_office_space",
    "bright_airy",
    "warm_intimate"
  ],
  people_in_scene: [
    "no_people",
    "individual",
    "couple",
    "family",
    "roommates",
    "friends",
    "parent_child",
    "multi_generational",
    "pet_owner"
  ],
  lifestyle_context: [
    "everyday_living",
    "entertaining_guests",
    "relaxing_alone",
    "working_from_home",
    "family_time",
    "romantic_moment",
    "morning_routine",
    "evening_unwind",
    "reading_relaxing",
    "watching_tv"
  ]
};

export interface PromptSelections {
  product?: string;
  hook_type?: string;
  pain_point?: string;
  tone?: string;
  visual_style?: string;
  // character_type?: string; // Removed - not furniture-specific
  // character_vibe?: string; // Removed - not furniture-specific
  // character_perception?: string; // Removed - not furniture-specific
  // group_context?: string; // Removed - not furniture-specific
  problem_context?: string;
  emotion_first_3_seconds?: string;
  platform?: string;
  transition_type?: string;
  ad_length: number; // Required - most important for video generation
  furniture_style?: string;
  brand_voice?: string;
  product_category?: string;
  room_setting?: string;
  furniture_material?: string;
  furniture_benefit?: string;
  product_highlights?: string;
  environment_style?: string;
  people_in_scene?: string;
  lifestyle_context?: string;
}
