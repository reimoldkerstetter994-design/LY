"""Character library.

Each character is a plain dict:

``id``            file-system friendly identifier (also the MPFB object name)
``name``          display name
``description``   short description (used in the README gallery)
``macro``         MakeHuman macro parameters, all in 0..1:
                  gender (0 = female, 1 = male), age (0.5 = 25 y, 0.1875 = 11 y,
                  1.0 = 90 y), muscle, weight, proportions (idealised body ratios),
                  height, cupsize, firmness, race (asian / caucasian / african mix)
``targets``       detail modelling targets ``name -> weight`` (-1..1; use the
                  ``*-decr``/``*-incr`` names shipped with MPFB)
``expression``    face-unit targets (mouth-corner-puller, eyebrows-left-up, ...)
``skin``          skin ``.mhmat`` from the installed skin asset packs
``skin_settings`` overrides for the MPFB "enhanced SSS" skin node group
``eyes``          iris preset, see ``builder.EYE_PRESETS``
``eyebrows`` / ``eyelashes`` / ``hair``  ``.mhclo`` body part assets
``hair_color``    linear RGB multiplier applied to hair (and eyebrows)
``clothes``       list of ``.mhclo`` clothing assets
``pose``          a pose from ``poses.MANUAL_POSES`` or ``bvh:<pose name>``
``environment``   lighting preset from ``scene.ENVIRONMENTS``
``portrait``      optional camera tweaks for the head shot ``{"azimuth": .., "elevation": ..}``
``seat``          ``"stool"`` adds a stool under a seated character
"""

ASIAN = {"asian": 1.0, "caucasian": 0.0, "african": 0.0}
CAUCASIAN = {"asian": 0.0, "caucasian": 1.0, "african": 0.0}
AFRICAN = {"asian": 0.0, "caucasian": 0.0, "african": 1.0}
EURASIAN = {"asian": 0.5, "caucasian": 0.5, "african": 0.0}
SOUTH_ASIAN = {"asian": 0.35, "caucasian": 0.45, "african": 0.20}

BLACK_HAIR = (0.045, 0.035, 0.03)
DARK_BROWN_HAIR = (0.11, 0.07, 0.045)
BROWN_HAIR = (0.26, 0.16, 0.09)
BLONDE_HAIR = (0.75, 0.58, 0.32)
GINGER_HAIR = (0.55, 0.22, 0.08)
GREY_HAIR = (0.62, 0.60, 0.58)
WHITE_HAIR = (0.85, 0.84, 0.82)


CHARACTERS = [
    {
        "id": "lin_yu",
        "name": "林雨",
        "description": "24 岁亚洲女性，身材纤细，休闲装，放松站姿",
        "macro": {"gender": 0.0, "age": 0.48, "muscle": 0.42, "weight": 0.40, "proportions": 0.65,
                  "height": 0.48, "cupsize": 0.45, "firmness": 0.65, "race": ASIAN},
        "targets": {
            "head-oval": 0.4, "chin-width-decr": 0.25, "nose-scale-horiz-decr": 0.2,
            "nose-hump-decr": 0.2, "l-eye-scale-incr": 0.15, "r-eye-scale-incr": 0.15,
            "mouth-scale-horiz-decr": 0.1, "l-cheek-bones-incr": 0.15, "r-cheek-bones-incr": 0.15,
        },
        "expression": {"mouth-corner-puller": 0.35},
        "skin": "young_asian_female.mhmat",
        "eyes": "dark_brown",
        "eyebrows": "eyebrow001.mhclo",
        "eyelashes": "eyelashes02.mhclo",
        "hair": "long01.mhclo",
        "hair_color": BLACK_HAIR,
        "clothes": ["female_casualsuit02.mhclo", "toigo_ballet_flats.mhclo"],
        "pose": "relaxed_stand",
        "environment": "studio",
    },
    {
        "id": "wang_qiang",
        "name": "王强",
        "description": "45 岁亚洲男性，中等体格，行走中",
        "macro": {"gender": 1.0, "age": 0.72, "muscle": 0.55, "weight": 0.58, "proportions": 0.45,
                  "height": 0.55, "race": ASIAN},
        "targets": {
            "head-square": 0.35, "chin-prominent-incr": 0.2, "nose-width2-incr": 0.2,
            "l-eye-bag-incr": 0.35, "r-eye-bag-incr": 0.35, "forehead-scale-vert-incr": 0.15,
            "stomach-tone-decr": 0.3, "torso-vshape-decr": 0.15,
        },
        "expression": {"mouth-compression": 0.15},
        "skin": "middleage_asian_male.mhmat",
        "eyes": "dark_brown",
        "eyebrows": "eyebrow009.mhclo",
        "eyelashes": "eyelashes03.mhclo",
        "hair": "short02.mhclo",
        "hair_color": BLACK_HAIR,
        "clothes": ["male_casualsuit04.mhclo", "shoes03.mhclo"],
        "pose": "walk",
        "environment": "outdoor",
    },
    {
        "id": "amara",
        "name": "Amara",
        "description": "27 岁非洲女性，运动员体型，运动装，contrapposto 站姿",
        "macro": {"gender": 0.0, "age": 0.52, "muscle": 0.72, "weight": 0.48, "proportions": 0.7,
                  "height": 0.62, "cupsize": 0.5, "firmness": 0.8, "race": AFRICAN},
        "targets": {
            "torso-vshape-incr": 0.25, "l-upperarm-muscle-incr": 0.3, "r-upperarm-muscle-incr": 0.3,
            "l-upperleg-muscle-incr": 0.3, "r-upperleg-muscle-incr": 0.3, "stomach-tone-incr": 0.5,
            "nose-flaring-incr": 0.2, "mouth-upperlip-volume-incr": 0.3, "mouth-lowerlip-volume-incr": 0.3,
            "l-cheek-bones-incr": 0.3, "r-cheek-bones-incr": 0.3,
        },
        "expression": {"mouth-corner-puller": 0.5, "eye-left-slit": 0.1, "eye-right-slit": 0.1},
        "skin": "young_african_female.mhmat",
        "skin_settings": {"SSS strength": 0.22, "Roughness": 0.40, "Clearcoat": 0.12},
        "eyes": "dark_brown",
        "eyebrows": "eyebrow004.mhclo",
        "eyelashes": "eyelashes01.mhclo",
        "hair": "braid01.mhclo",
        "hair_color": BLACK_HAIR,
        "clothes": ["female_sportsuit01.mhclo", "shoes06.mhclo"],
        "pose": "contrapposto",
        "environment": "studio_dark",
    },
    {
        "id": "kwame",
        "name": "Kwame",
        "description": "68 岁非洲男性，正装，坐姿",
        "macro": {"gender": 1.0, "age": 0.86, "muscle": 0.45, "weight": 0.55, "proportions": 0.4,
                  "height": 0.52, "race": AFRICAN},
        "targets": {
            "head-fat-incr": 0.15, "l-eye-bag-incr": 0.5, "r-eye-bag-incr": 0.5, "neck-double-incr": 0.2,
            "chin-jaw-drop-incr": 0.1, "mouth-laugh-lines-in": -0.3, "nose-width3-incr": 0.2,
            "forehead-trans-backward": 0.15, "stomach-tone-decr": 0.35,
        },
        "expression": {"mouth-corner-puller": 0.25},
        "skin": "old_african_male.mhmat",
        "skin_settings": {"SSS strength": 0.18, "Roughness": 0.55, "Pore strength": 0.5},
        "eyes": "dark_brown",
        "eyebrows": "eyebrow011.mhclo",
        "eyelashes": "eyelashes03.mhclo",
        "hair": "short04.mhclo",
        "hair_color": GREY_HAIR,
        "eyebrow_color": (0.5, 0.48, 0.46),
        "clothes": ["male_elegantsuit01.mhclo", "shoes02.mhclo"],
        "pose": "bvh:callharvey3d_sittingnatural",
        "seat": "stool",
        "environment": "studio_warm",
    },
    {
        "id": "emma",
        "name": "Emma",
        "description": "22 岁欧洲女性，雀斑、红发编发，夏装，挥手",
        "macro": {"gender": 0.0, "age": 0.45, "muscle": 0.45, "weight": 0.47, "proportions": 0.55,
                  "height": 0.5, "cupsize": 0.55, "firmness": 0.7, "race": CAUCASIAN},
        "targets": {
            "head-round": 0.2, "nose-point-up": 0.15, "nose-scale-vert-decr": 0.1,
            "l-eye-scale-incr": 0.1, "r-eye-scale-incr": 0.1, "mouth-cupidsbow-incr": 0.3,
            "chin-height-decr": 0.15, "l-cheek-volume-incr": 0.2, "r-cheek-volume-incr": 0.2,
        },
        "expression": {"mouth-corner-puller": 0.7, "mouth-open": 0.15, "eyebrows-left-up": 0.2, "eyebrows-right-up": 0.2},
        "skin": "toigo_light_skin_female_freckles.mhmat",
        "skin_settings": {"SSS strength": 0.38, "Roughness": 0.45},
        "eyes": "green",
        "eyebrows": "eyebrow002.mhclo",
        "eyelashes": "eyelashes02.mhclo",
        "hair": "braid01.mhclo",
        "hair_color": GINGER_HAIR,
        "eyebrow_color": (0.45, 0.22, 0.10),
        "clothes": ["toigo_camisole_dress_with_full_skirt.mhclo", "toigo_ballet_flats_with_bows.mhclo"],
        "pose": "wave",
        "environment": "outdoor",
    },
    {
        "id": "lars",
        "name": "Lars",
        "description": "30 岁北欧男性，高大健壮，Polo 衫工装裤，手托下巴",
        "macro": {"gender": 1.0, "age": 0.55, "muscle": 0.75, "weight": 0.55, "proportions": 0.6,
                  "height": 0.78, "race": CAUCASIAN},
        "targets": {
            "torso-vshape-incr": 0.4, "torso-muscle-pectoral-incr": 0.3, "torso-muscle-dorsi-incr": 0.3,
            "l-upperarm-muscle-incr": 0.4, "r-upperarm-muscle-incr": 0.4,
            "chin-width-incr": 0.3, "chin-prominent-incr": 0.2, "head-rectangular": 0.3,
            "nose-hump-incr": 0.15, "eyebrows-trans-down": 0.15, "measure-neck-circ-incr": 0.2,
        },
        "expression": {"mouth-compression": 0.2, "eyebrows-left-down": 0.15, "eyebrows-right-down": 0.15},
        "skin": "young_caucasian_male.mhmat",
        "eyes": "blue",
        "eyebrows": "eyebrow007.mhclo",
        "eyelashes": "eyelashes03.mhclo",
        "hair": "short03.mhclo",
        "hair_color": BLONDE_HAIR,
        "eyebrow_color": (0.55, 0.42, 0.25),
        "clothes": ["namuhekam_male_polo_shirt.mhclo", "cortu_cargo_pants.mhclo", "culturalibre_male_boots.mhclo"],
        "pose": "thinking",
        "environment": "studio",
    },
    {
        "id": "priya",
        "name": "Priya",
        "description": "29 岁南亚女性，吊带上衣与哈伦裤，莲花坐",
        "macro": {"gender": 0.0, "age": 0.53, "muscle": 0.48, "weight": 0.46, "proportions": 0.6,
                  "height": 0.42, "cupsize": 0.5, "firmness": 0.7, "race": SOUTH_ASIAN},
        "targets": {
            "head-oval": 0.3, "nose-scale-vert-incr": 0.1, "nose-point-down": 0.1,
            "l-eye-scale-incr": 0.2, "r-eye-scale-incr": 0.2, "eyebrows-angle-up": 0.15,
            "mouth-upperlip-volume-incr": 0.2, "mouth-lowerlip-volume-incr": 0.2,
        },
        "expression": {"mouth-corner-puller": 0.2},
        "skin": "cutoff3d_indian_female_enhanced.mhmat",
        "skin_settings": {"SSS strength": 0.3},
        "eyes": "dark_brown",
        "eyebrows": "eyebrow003.mhclo",
        "eyelashes": "eyelashes02.mhclo",
        "hair": "ponytail01.mhclo",
        "hair_color": BLACK_HAIR,
        "clothes": ["toigo_camisole_top.mhclo", "toigo_harem_pants.mhclo"],
        "pose": "bvh:callharvey3d_lotus",
        "environment": "studio_bright",
    },
    {
        "id": "rosa",
        "name": "Rosa",
        "description": "52 岁南欧女性，丰满体型，职业套装",
        "macro": {"gender": 0.0, "age": 0.78, "muscle": 0.4, "weight": 0.74, "proportions": 0.4,
                  "height": 0.45, "cupsize": 0.7, "firmness": 0.35, "race": CAUCASIAN},
        "targets": {
            "head-round": 0.3, "head-fat-incr": 0.2, "neck-double-incr": 0.3, "l-eye-bag-incr": 0.3,
            "r-eye-bag-incr": 0.3, "mouth-laugh-lines-in": -0.35, "nose-scale-horiz-incr": 0.1,
            "hip-scale-horiz-incr": 0.2, "stomach-tone-decr": 0.3, "buttocks-volume-incr": 0.2,
        },
        "expression": {"mouth-corner-puller": 0.45},
        "skin": "middleage_caucasian_female.mhmat",
        "skin_settings": {"Pore strength": 0.45},
        "eyes": "hazel",
        "eyebrows": "eyebrow005.mhclo",
        "eyelashes": "eyelashes01.mhclo",
        "hair": "bob01.mhclo",
        "hair_color": DARK_BROWN_HAIR,
        "clothes": ["female_elegantsuit01.mhclo", "toigo_flats.mhclo"],
        "pose": "relaxed_stand",
        "portrait": {"azimuth": -15.0},
        "environment": "studio_warm",
    },
    {
        "id": "chen_nainai",
        "name": "陈奶奶",
        "description": "78 岁亚洲女性，银色短发，和服",
        "macro": {"gender": 0.0, "age": 0.93, "muscle": 0.35, "weight": 0.42, "proportions": 0.35,
                  "height": 0.32, "cupsize": 0.4, "firmness": 0.2, "race": ASIAN},
        "targets": {
            "head-age-incr": 0.4, "l-eye-bag-incr": 0.6, "r-eye-bag-incr": 0.6, "l-eye-eyefold-down": 0.3,
            "r-eye-eyefold-down": 0.3, "mouth-laugh-lines-in": -0.5, "chin-jaw-drop-incr": 0.2,
            "neck-double-incr": 0.2, "mouth-upperlip-volume-decr": 0.3, "mouth-lowerlip-volume-decr": 0.2,
            "torso-trans-forward": 0.1,
        },
        "expression": {"mouth-corner-puller": 0.4, "eye-left-slit": 0.2, "eye-right-slit": 0.2},
        "skin": "old_asian_female.mhmat",
        "skin_settings": {"Pore strength": 0.55, "Roughness": 0.6, "SSS strength": 0.2},
        "eyes": "dark_brown",
        "eyebrows": "eyebrow012.mhclo",
        "eyelashes": "eyelashes03.mhclo",
        "hair": "short04.mhclo",
        "hair_color": WHITE_HAIR,
        "eyebrow_color": (0.6, 0.58, 0.56),
        "clothes": ["mindfront_kimono.mhclo", "toigo_mj_cloth_shoes.mhclo"],
        "pose": "relaxed_stand",
        "environment": "studio_bright",
    },
    {
        "id": "tom",
        "name": "Tom",
        "description": "10 岁欧洲男孩，T 恤短裤，挥手",
        "macro": {"gender": 1.0, "age": 0.17, "muscle": 0.4, "weight": 0.5, "proportions": 0.5,
                  "height": 0.5, "race": CAUCASIAN},
        "targets": {
            "head-round": 0.3, "l-eye-scale-incr": 0.2, "r-eye-scale-incr": 0.2,
            "nose-point-up": 0.2, "l-cheek-volume-incr": 0.25, "r-cheek-volume-incr": 0.25,
        },
        "expression": {"mouth-corner-puller": 0.45, "mouth-open": 0.08, "eyebrows-left-up": 0.1, "eyebrows-right-up": 0.1},
        "skin": "young_caucasian_male.mhmat",
        "skin_settings": {"SSS strength": 0.4, "Pore strength": 0.08, "Roughness": 0.42},
        "eyes": "blue",
        "eyebrows": "eyebrow001.mhclo",
        "eyelashes": "eyelashes01.mhclo",
        "hair": "short01.mhclo",
        "hair_color": BROWN_HAIR,
        "clothes": ["toigo_basic_tucked_t-shirt.mhclo", "cortu_jeans_shorts.mhclo", "toigo_mj_cloth_shoes.mhclo"],
        "pose": "wave",
        "environment": "outdoor",
    },
    {
        "id": "yusuf",
        "name": "Yusuf",
        "description": "35 岁中东/欧亚混血男性，工作服，放松站姿",
        "macro": {"gender": 1.0, "age": 0.6, "muscle": 0.6, "weight": 0.52, "proportions": 0.5,
                  "height": 0.58, "race": {"asian": 0.25, "caucasian": 0.6, "african": 0.15}},
        "targets": {
            "nose-hump-incr": 0.35, "nose-scale-vert-incr": 0.2, "chin-prominent-incr": 0.15,
            "eyebrows-trans-down": 0.2, "head-rectangular": 0.2, "l-cheek-inner-decr": 0.2, "r-cheek-inner-decr": 0.2,
        },
        "expression": {"mouth-corner-puller": 0.15},
        "skin": "middleage_caucasian_male.mhmat",
        "skin_settings": {"colorMixIn": (0.55, 0.38, 0.25), "colorMixInStrength": 0.22, "Roughness": 0.5},
        "eyes": "brown",
        "eyebrows": "eyebrow010.mhclo",
        "eyelashes": "eyelashes03.mhclo",
        "hair": "short02.mhclo",
        "hair_color": BLACK_HAIR,
        "clothes": ["male_worksuit01.mhclo", "toigo_ankle_boots_male.mhclo"],
        "pose": "relaxed_stand",
        "environment": "outdoor_evening",
    },
    {
        "id": "mei",
        "name": "Mei",
        "description": "35 岁欧亚混血女性，马尾，毛衣长裤，坐在地上",
        "macro": {"gender": 0.0, "age": 0.6, "muscle": 0.5, "weight": 0.5, "proportions": 0.55,
                  "height": 0.5, "cupsize": 0.5, "firmness": 0.6, "race": EURASIAN},
        "targets": {
            "head-oval": 0.2, "l-cheek-bones-incr": 0.2, "r-cheek-bones-incr": 0.2,
            "mouth-scale-horiz-incr": 0.1, "chin-triangle": 0.2,
        },
        "expression": {"mouth-corner-puller": 0.3},
        "skin": "onlytheghosts_middle_aged_eurasian_female.mhmat",
        "eyes": "hazel",
        "eyebrows": "eyebrow008.mhclo",
        "eyelashes": "eyelashes02.mhclo",
        "hair": "ponytail01.mhclo",
        "hair_color": DARK_BROWN_HAIR,
        "clothes": ["toigo_fisherman_sweater.mhclo", "toigo_wool_pants.mhclo", "toigo_ankle_boots_female.mhclo"],
        "pose": "bvh:wolgade_sit_on_ground_01",
        "environment": "studio",
    },
]


def by_id(character_id):
    for character in CHARACTERS:
        if character["id"] == character_id:
            return character
    raise KeyError(f"Unknown character '{character_id}'. Known: {[c['id'] for c in CHARACTERS]}")
