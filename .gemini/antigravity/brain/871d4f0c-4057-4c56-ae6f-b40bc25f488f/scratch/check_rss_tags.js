const RSSParser = require('rss-parser');
const parser = new RSSParser();

const urls = [
    'https://news.google.com/rss/search?q=andhra+pradesh',
    'https://news.google.com/rss/search?q=telangana',
    'https://news.google.com/rss/search?q=hyderabad',
    'https://news.google.com/rss/search?q=tamil+nadu',
    'https://news.google.com/rss/search?q=delhi',
    'https://feeds.feedburner.com/ndtvnews-top-stories',
    'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',
    'https://www.indiatoday.in/rss/home',
    'https://www.thehindu.com/feeder/default.rss',
    'https://indianexpress.com/feed/',
    'https://www.livemint.com/rss/news',
    'https://timesofindia.indiatimes.com/rssfeeds/-2128839596.cms',
    'https://timesofindia.indiatimes.com/rssfeeds/-2128833038.cms'
];

async function checkFeeds() {
    console.log('--- RSS FEED TAG REPORT ---\n');
    for (const url of urls) {
        try {
            const feed = await parser.parseURL(url);
            const hasTags = feed.items.some(item => item.categories && item.categories.length > 0);
            
            console.log(`URL: ${url}`);
            console.log(`Feed: ${feed.title || 'Unknown'}`);
            console.log(`Has Tags: ${hasTags ? '✅ YES' : '❌ NO'}`);
            
            if (feed.items.length > 0) {
                console.log('Examples:');
                feed.items.slice(0, 2).forEach((item, idx) => {
                    console.log(`  ${idx + 1}. Title: ${item.title.substring(0, 60)}...`);
                    console.log(`     Tags: ${JSON.stringify(item.categories || [])}`);
                });
            }
            console.log('--------------------------------------------------\n');
        } catch (err) {
            console.log(`URL: ${url}`);
            console.log(`❌ Error: ${err.message}`);
            console.log('--------------------------------------------------\n');
        }
    }
}

checkFeeds();
