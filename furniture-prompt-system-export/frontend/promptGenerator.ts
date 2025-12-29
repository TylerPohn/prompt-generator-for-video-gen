export interface PromptGeneratorOptions {
  furniture_style: string[];
  brand_voice: string[];
  product_category: string[];
  furniture_material: string[];
  product_highlights: string[];
  environment_style: string[];
  ad_length: number[];
}

export const PROMPT_OPTIONS: PromptGeneratorOptions = {
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
    "classic_traditional"
  ],
  brand_voice: [
    "sophisticated",
    "warm_inviting",
    "artistic",
    "functional_practical",
    "playful",
    "neutral_clean"
  ],
  product_category: [
    "sofa_sectional",
    "dining_table",
    "chair",
    "bed_bedroom_set",
    "office_desk",
    "storage_shelves",
    "accent_furniture",
    "outdoor_furniture"
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
    "marble"
  ],
  product_highlights: [
    "handcrafted",
    "new_arrival",
    "best_seller",
    "customizable_sizes",
    "sustainable_materials",
    "space_saving_design",
    "ergonomic",
    "pet_friendly",
    "locally_made"
  ],
  environment_style: [
    "modern_loft",
    "cozy_home",
    "luxury_living_room",
    "minimalist_white_studio",
    "rustic_cabin_interior",
    "urban_apartment",
    "outdoor_patio_scene",
    "commercial_office_space"
  ],
  ad_length: [4, 6, 8]
};

export interface PromptSelections {
  product?: string;
  furniture_style?: string;
  brand_voice?: string;
  product_category?: string;
  furniture_material?: string;
  product_highlights?: string;
  environment_style?: string;
  ad_length: number; // Required
}
