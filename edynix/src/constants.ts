export const GAME_CONFIGS: Record<string, { logo: string; clipperName: string; prompt: string }> = {
  'Valorant': {
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Valorant_logo_-_pink_color_version.svg/512px-Valorant_logo_-_pink_color_version.svg.png',
    clipperName: 'Valorant Clipper',
    prompt: "Identify the exact seconds where the player gets a kill. Look for the kill banner (skull/weapon icon) at the bottom center. Return a JSON array of the first second each banner appears. Return [] if none."
  },
  'Free Fire': {
    logo: 'https://upload.wikimedia.org/wikipedia/en/3/30/Garena_Free_Fire_logo.png',
    clipperName: 'Free Fire Clipper',
    prompt: "Identify the exact seconds where the player gets a kill. Look for the kill icon (skull/kneeling figure). Return a JSON array of the first second each icon appears. Return [] if none."
  },
  'Fortnite': {
    logo: 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Fortnite_F_lettermark_logo.png',
    clipperName: 'Fortnite Clipper',
    prompt: "Identify the exact seconds where the player gets a kill. Look for the 'Eliminated' notification or the red 'X' icon that appears when a player is downed or eliminated. Return a JSON array of the first second each appears. Return [] if none."
  },
  'COD': {
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Call_of_Duty_logo.svg/512px-Call_of_Duty_logo.svg.png',
    clipperName: 'COD Clipper',
    prompt: "Identify the exact seconds where the player gets a kill. Look for the 'Kill' or 'Headshot' medals and text that appear in the center of the screen. Return a JSON array of the first second each appears. Return [] if none."
  }
};

export const WEBSITE_LOGO = 'https://i.ibb.co/rg0TChV/Screenshot-2026-03-04-210703.png'; 
