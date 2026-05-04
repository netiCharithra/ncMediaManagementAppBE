'use strict';
const axios = require('axios');
const { imageInfo, IMAGE_EVENTS } = require('./imageLogger');

const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt';
const POLLINATIONS_WIDTH = 1024;
const POLLINATIONS_HEIGHT = 768;

const SCENE_HINTS = {
    election: 'Indian election counting centre, EVM machines, officials in white shirts',
    vote: 'Indian voting booth, ballot box, election officials, rural setting',
    parliament: 'Indian Parliament building exterior, New Delhi, grand architecture',
    minister: 'Government press conference stage, podium with microphones, Indian flags',
    politics: 'Government building, Indian tricolour flag, official signage',
    cricket: 'Cricket stadium aerial view, green pitch, colourful stands',
    ipl: 'IPL cricket stadium at night, floodlights, crowd, colourful team banners',
    football: 'Football stadium, green turf, goal posts, cheering crowd',
    sports: 'Sports stadium, athletic field, championship trophy on podium',
    market: 'Bombay Stock Exchange exterior, Mumbai financial district, traders',
    economy: 'Indian financial district skyline, glass towers, busy street below',
    startup: 'Modern co-working space, laptops, whiteboards, startup office India',
    bank: 'Reserve Bank of India building, stone columns, formal architecture',
    business: 'Corporate boardroom, conference table, city skyline through glass window',
    ai: 'Futuristic server room, blue glowing servers, technology lab',
    tech: 'Modern Indian tech campus, glass buildings, drone shot',
    software: 'Lines of code on screen, developer workspace, multiple monitors',
    satellite: 'ISRO launch pad, rocket on stand, pre-launch scene, India',
    space: 'ISRO mission control room, scientists, large display screens',
    technology: 'Modern robotics lab, circuit boards, holographic displays',
    hospital: 'Modern Indian hospital exterior, emergency entrance, clean corridors',
    vaccine: 'Medical vials and syringes lined up, clinical lab setting',
    health: 'Clean hospital ward, doctors in white coats, medical equipment',
    covid: 'Medical laboratory, test tubes, researchers in protective gear',
    film: 'Bollywood movie set, cameras, director\'s chair, dramatic lighting',
    cinema: 'Indian cinema multiplex exterior with glowing signage at night',
    music: 'Concert stage with colourful lights, empty venue pre-show',
    entertainment: 'Glamorous award ceremony stage with golden trophies, spotlights',
    police: 'Indian police vehicle, officers in uniform, official setting',
    court: 'Indian court building exterior, stone columns, law books',
    crime: 'Empty dark alley at night, police crime scene tape, street lights',
    rain: 'Heavy monsoon rain on Indian city street, reflections in puddles',
    flood: 'Flooded Indian village, submerged roads, relief boats, aerial view',
    cyclone: 'Dramatic storm clouds over coastline, dark sky, turbulent sea',
    weather: 'Dramatic stormy sky over Indian landscape, approaching dark clouds',
    school: 'Indian government school building, colourful classrooms, playground',
    university: 'Indian university campus, grand main building, students walking',
    exam: 'Empty examination hall, rows of desks, answer sheets, invigilators',
    education: 'Modern Indian school library, bookshelves, reading tables',
    train: 'Indian Railways locomotive at station platform, early morning',
    airport: 'Indian international airport terminal, modern architecture',
    road: 'National highway construction, highway overpass, infrastructure India',
    infrastructure: 'Bridge construction over Indian river, cranes, civil engineering site',
    agriculture: 'Lush green Indian farmland, irrigation canals, tractor in field',
    farmer: 'Indian wheat or paddy field at golden hour, agricultural landscape',
    water: 'Indian river dam, hydroelectric power station, blue reservoir',
    temple: 'South Indian temple gopuram, intricate stone carvings, sunrise',
    festival: 'Colourful Indian festival street decorations, lamps, cultural setting',
    heritage: 'Ancient Indian monument, UNESCO heritage site, clear sky',
};

const pickSceneHint = (text) => {
    for (const [keyword, scene] of Object.entries(SCENE_HINTS)) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(text)) return scene;
    }
    return '';
};

const buildDocumentaryPrompt = (title, summary = '') => {
    const sceneHint = pickSceneHint(`${title} ${summary}`.toLowerCase());
    const subject = title.substring(0, 120).trim();
    return [
        'Realistic news photo',
        sceneHint ? `of ${sceneHint}` : '',
        `subject: ${subject}`,
        'documentary style, photojournalism, natural realistic lighting, high resolution, no text, no watermark, no logos, no people faces'
    ].filter(Boolean).join(', ');
};

const generateFromPollinations = async (title, summary) => {
    const prompt = buildDocumentaryPrompt(title, summary);
    imageInfo('Pollinations', IMAGE_EVENTS.REQUESTED, 'Requesting image');
    
    const seed = Math.floor(Math.random() * 1000000);
    const url = `${POLLINATIONS_BASE}/${encodeURIComponent(prompt)}?width=${POLLINATIONS_WIDTH}&height=${POLLINATIONS_HEIGHT}&nologo=true&seed=${seed}`;
    
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
    if (!response.data || response.data.byteLength < 2000) throw new Error('Invalid pollinations image.');
    return Buffer.from(response.data);
};

module.exports = { generateFromPollinations };
