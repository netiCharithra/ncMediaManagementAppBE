const { HfInference } = require('@huggingface/inference');
require('dotenv').config();

const hf = new HfInference(process.env.HUGGING_FACE_API_KEY || process.env.HF_TOKEN);

(async () => {
    console.log('Testing HF Inference...');
    try {
        const imageBlob = await hf.textToImage({
            model: 'black-forest-labs/FLUX.1-schnell',
            inputs: 'A simple news photo of a digital city.',
            parameters: { guidance_scale: 3.5 },
        });
        console.log('SUCCESS: Got image blob of size:', imageBlob.size);
    } catch (err) {
        console.error('FAILURE:', err.message);
    }
})();
