const DEFAULT_BG = "/static/default_bg.jpg";
const ENGINES = {
    bing: { name: 'Bing', url: 'https://www.bing.com/search?q=', logo: 'https://www.bing.com/favicon.ico' },
    baidu: { name: 'Baidu', url: 'https://www.baidu.com/s?wd=', logo: 'https://www.baidu.com/favicon.ico' },
    google: { name: 'Google', url: 'https://www.google.com/search?q=', logo: 'https://www.google.com/favicon.ico' }
};
let currentEngine = 'bing';