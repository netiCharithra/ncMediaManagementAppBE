const fs = require('fs');
const path = require('path');

const excludeVars = ['NODE_ENV', 'PORT', 'GOOGLE_APPLICATION_CREDENTIALS'];

// Variables to rename. Extracted from .env and our recent analysis.
const varsToPrefix = [
    'MONGO_URI', 'JWT_SECRET', 'JWT_EXPIRES_IN', 'JWT_REFRESH_SECRET', 'JWT_REFRESH_EXPIRES_IN',
    'REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD', 'FIREBASE_PROJECT_ID', 'FIREBASE_PRIVATE_KEY_ID',
    'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_CLIENT_ID', 'FIREBASE_DATABASE_URL',
    'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_PHONE', 'TRANSLATION_API_URL', 'TRANSLATION_API_KEY',
    'GOOGLE_TRANSLATE_API_KEY', 'OPENAI_API_KEY', 'GROQ_API_KEY', 'RSS_FEED_URLS',
    'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL',
    'RATE_LIMIT_WINDOW_MS', 'RATE_LIMIT_MAX', 'LOG_LEVEL', 'LOG_DIR', 'LOG_HTTP_BODY', 'PAUSE_GCP_LOGGING',
    'ALLOWED_ORIGINS', 'IMAGE_WORKER_BATCH_SIZE', 'IMAGE_WORKER_DELAY_MS', 'GEMINI_WORKER_BATCH_SIZE',
    'TAG_DEDUP_WINDOW_HOURS', 'TAG_MATCH_THRESHOLD', 'GEMINI_API_KEY', 'HF_TOKEN', 'HUGGING_FACE_API_KEY',
    'DISABLE_CRON', 'DISABLE_RSS', 'MAX_MPIN_ATTEMPTS', 'MPIN_LOCK_MINUTES'
];

function replaceInFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    for (let v of varsToPrefix) {
        if (filePath.endsWith('.env') || filePath.endsWith('.env.example') || filePath.endsWith('.yml')) {
            // Replace declarations like VAR= even if indented
            let declareRegex = new RegExp(`^(\\s*)${v}(=)`, 'gm');
            content = content.replace(declareRegex, `$1VIVA_DIGITAL_${v}$2`);
        }
    }

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated: ${filePath}`);
    }
}

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file === 'node_modules' || file === '.git') continue;
            processDirectory(fullPath);
        } else {
            if (fullPath.endsWith('.js') || fullPath.endsWith('.env') || fullPath.endsWith('.example') || fullPath.endsWith('.yml')) {
                replaceInFile(fullPath);
            }
        }
    }
}

const targetDir = path.resolve(__dirname, '../../');
processDirectory(targetDir);
console.log('Environment variable prefixing done!');
