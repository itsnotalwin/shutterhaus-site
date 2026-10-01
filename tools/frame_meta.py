"""
Per-frame alt text and category for the gallery.

Why this file exists
--------------------
Every one of the 50 frames shipped with the SAME alt text, "Portrait, natural
light" (hardcoded in build-demo-ts.py). That string is the SEO description, the
screen-reader label AND the lightbox caption, so 50 identical descriptions is
both an accessibility failure and lost search value.

The categories here are NOT guessed. They came from looking at a contact sheet
of all 50 frames (tools/contact-sheet-gallery.py) and reading what is actually
in them. The honest result is that the gallery is almost entirely solo
portraits, plus a few landscapes — there are no couples, no families and no
social groups in it.

That matters: an earlier mockup of the filter bar showed "Portraits 28, Couples
9, Families 7, Social 6". Those numbers were invented placeholders and the
frames do not support them. Do not reintroduce them.

Format
------
{
  "<filename>": {"alt": "...", "cat": "portrait"|"landscape"}
}

`alt` describes what is IN the frame, for someone who cannot see it. Keep it
under ~125 characters. `cat` is what the filter bar groups on.
"""

CATEGORIES = {
    # No couples, no families, no social groups are present in this gallery.
    "portrait": "Portraits",
    "landscape": "Landscapes",
}

FRAMES: dict[str, dict[str, str]] = {
    # --- solo portraits, main subject, indoor ---
    "49-img-0131.jpg": {"alt": "Portrait of a woman in a black top and pale skirt, standing against a dark background", "cat": "portrait"},
    "40-img-0092.jpg": {"alt": "Portrait of a woman in a black top and pale skirt, lit from the front against a dark wall", "cat": "portrait"},
    "48-img-0128.jpg": {"alt": "Portrait of a woman in a black top and pale skirt, standing in low indoor light", "cat": "portrait"},
    "47-img-0121.jpg": {"alt": "Portrait of a woman in a black top and pale skirt, one arm raised against a green backdrop", "cat": "portrait"},
    "42-img-0095.jpg": {"alt": "Portrait of a woman in a black top and pale skirt, arm raised overhead against a green backdrop", "cat": "portrait"},
    "39-img-0089.jpg": {"alt": "Portrait of a woman in a black top and pale skirt, arms lifted against a green backdrop", "cat": "portrait"},
    "51-img-0145.jpg": {"alt": "Portrait of a woman in a black top and pale skirt, hand resting on her head against a green backdrop", "cat": "portrait"},
    "38-img-0087.jpg": {"alt": "Full-length portrait of a woman in a black top and pale skirt, standing indoors", "cat": "portrait"},
    "45-img-0118.jpg": {"alt": "Portrait of a woman in a black top and pale skirt, standing with one hand at her hip", "cat": "portrait"},
    "43-img-0096.jpg": {"alt": "Portrait of a woman in a black top and pale skirt, standing against a green backdrop", "cat": "portrait"},
    "53-img-0155.jpg": {"alt": "Full-length portrait of a woman in a black top and pale skirt against a green backdrop", "cat": "portrait"},
    "52-img-0149.jpg": {"alt": "Full-length portrait of a woman in a black top and pale skirt, standing against a green backdrop", "cat": "portrait"},
    "46-img-0119.jpg": {"alt": "Portrait of a woman in a black top and pale skirt, both arms raised overhead", "cat": "portrait"},
    "44-img-0098.jpg": {"alt": "Portrait of a woman in a black top and pale skirt, hand raised to her hair", "cat": "portrait"},
    "41-img-0094.jpg": {"alt": "Portrait of a woman looking back over her shoulder, hair falling across her face", "cat": "portrait"},
    "33-img-0426.jpg": {"alt": "Close portrait of a woman with her hair tied up, in soft indoor light", "cat": "portrait"},
    "50-img-0143.jpg": {"alt": "Portrait of a woman in warm low light, looking directly at the camera", "cat": "portrait"},
    "26-img-0253.jpg": {"alt": "Portrait of a woman outdoors, backlit by low sun", "cat": "portrait"},
    "19-img-0198-3.jpg": {"alt": "Close portrait of a woman smiling, lit by warm afternoon light", "cat": "portrait"},
    "22-img-0239.jpg": {"alt": "Close portrait of a woman with loose hair, warm light across her face", "cat": "portrait"},
    "28-img-0308.jpg": {"alt": "Close portrait of a woman looking at the camera, soft neutral light", "cat": "portrait"},
    "29-img-0383.jpg": {"alt": "Close portrait of a woman with dark hair against a dark background", "cat": "portrait"},
    "20-img-0202.jpg": {"alt": "Portrait of a woman seated on a chair in a black top, lit warmly", "cat": "portrait"},

    # --- solo portraits, black and white ---
    "32-img-0404.jpg": {"alt": "Black and white portrait of a woman seated on the floor in a patterned skirt", "cat": "portrait"},
    "14-img-0026.jpg": {"alt": "Black and white portrait of a woman with a hand in her hair", "cat": "portrait"},
    "11-img-0018.jpg": {"alt": "Black and white portrait of a woman looking down and away from the camera", "cat": "portrait"},
    "30-img-0396.jpg": {"alt": "Black and white portrait of a woman seated with both arms raised", "cat": "portrait"},
    "36-img-0076.jpg": {"alt": "Black and white close portrait of a woman, tightly cropped", "cat": "portrait"},
    "37-img-0124.jpg": {"alt": "Black and white portrait of a woman resting her chin on her hand", "cat": "portrait"},
    "16-img-0030.jpg": {"alt": "Black and white portrait of a woman outdoors", "cat": "portrait"},
    "15-img-0025.jpg": {"alt": "Black and white portrait of a woman with her hair caught by the wind", "cat": "portrait"},
    "21-img-0234.jpg": {"alt": "Black and white portrait of a woman outdoors in a thin-strapped top", "cat": "portrait"},
    "12-img-0019.jpg": {"alt": "Black and white portrait of a woman facing the camera", "cat": "portrait"},
    "18-img-0043.jpg": {"alt": "Black and white portrait of a woman outdoors, looking down", "cat": "portrait"},
    "23-img-0240.jpg": {"alt": "Black and white portrait of a woman in profile", "cat": "portrait"},
    "25-img-0249.jpg": {"alt": "Black and white close portrait of a woman", "cat": "portrait"},
    "34-img-0461.jpg": {"alt": "Black and white close portrait of a woman with her hair down", "cat": "portrait"},
    "31-img-0397.jpg": {"alt": "Black and white portrait of a woman turned to one side, hand raised", "cat": "portrait"},
    "27-img-0297.jpg": {"alt": "Black and white portrait of a woman seated on the ground, legs to one side", "cat": "portrait"},
    "35-img-0482.jpg": {"alt": "Black and white portrait of a woman crouching, looking at the camera", "cat": "portrait"},

    # --- second subject ---
    "4-img-0068.jpg": {"alt": "Black and white portrait of a young man in a beanie and sweatshirt", "cat": "portrait"},
    "5-img-0086.jpg": {"alt": "Black and white portrait of a young man in a beanie and a Manhattan sweatshirt", "cat": "portrait"},
    "1-20240718113728-img-0065.jpg": {"alt": "Portrait of a woman in a white top with her hair tied back, looking off into the distance", "cat": "portrait"},
    "2-20240718114526-img-0124.jpg": {"alt": "Portrait of a woman in a white top outdoors, hair pulled back, in bright light", "cat": "portrait"},

    # --- by the water ---
    "24-img-0245.jpg": {"alt": "Portrait of a woman standing by the water under an overcast sky", "cat": "portrait"},
    "13-img-0020.jpg": {"alt": "Full-length portrait of a woman walking beside the water", "cat": "portrait"},

    # --- landscapes: no people in frame ---
    "9-img-0269.jpg": {"alt": "Masts of boats in a harbour under a flat grey sky", "cat": "landscape"},
    "6-img-0161.jpg": {"alt": "Sun setting over the sea, orange light on the horizon", "cat": "landscape"},
    "8-img-0268.jpg": {"alt": "Blue ocean waves breaking close to shore", "cat": "landscape"},
    "7-img-0207.jpg": {"alt": "A city skyline across the water at dusk", "cat": "landscape"},
}
