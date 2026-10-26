"""Color themes. Each Short picks one via its script's "theme" field, so the
channel rotates looks by topic instead of repeating one template."""

THEMES = {
    # Finance / tech: black with glowing green.
    "dark_neon": {
        "bg_top": (6, 9, 8),
        "bg_bottom": (10, 22, 14),
        "text": (240, 255, 244),
        "muted": (140, 170, 150),
        "accent": (57, 255, 106),
        "accent2": (0, 200, 140),
        "track": (30, 48, 36),
        "caption_fill": (255, 255, 255),
        "caption_hi": (57, 255, 106),
        "caption_stroke": (0, 0, 0),
        "image_tint": (0, 0, 0),
    },
    # Consumer brands: punchy warm gradient.
    "bold_bright": {
        "bg_top": (255, 64, 88),
        "bg_bottom": (255, 150, 40),
        "text": (255, 255, 255),
        "muted": (255, 232, 214),
        "accent": (255, 232, 60),
        "accent2": (40, 20, 60),
        "track": (255, 255, 255, 70),
        "caption_fill": (255, 255, 255),
        "caption_hi": (255, 232, 60),
        "caption_stroke": (30, 10, 30),
        "image_tint": (20, 0, 20),
    },
    # Corporate / big companies: clean white and navy.
    "clean_navy": {
        "bg_top": (247, 248, 251),
        "bg_bottom": (226, 232, 245),
        "text": (11, 31, 68),
        "muted": (95, 110, 140),
        "accent": (31, 91, 255),
        "accent2": (11, 31, 68),
        "track": (205, 213, 230),
        "caption_fill": (255, 255, 255),
        "caption_hi": (120, 170, 255),
        "caption_stroke": (11, 31, 68),
        "image_tint": (5, 15, 40),
        "tag_text": (255, 255, 255),
    },
}


def get_theme(name: str) -> dict:
    return THEMES.get(name, THEMES["dark_neon"])
