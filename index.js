const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs');

const temp_path = process.env.WENKU8_TEMP_PATH || `/tmp/light_novels`;
const download_path = process.env.WENKU8_DOWNLOAD_PATH || process.cwd();
const wenku8_url = `https://www.wenku8.net`;
const wenku8_login = `${wenku8_url}/login.php?do=submit&jumpurl=http%3A%2F%2Fwww.wenku8.net%2Findex.php`;
const wenku8_books = `${wenku8_url}/modules/article/bookcase.php`;
const wenku8_umd_url = `https://dl1.wenku8.com/down/umd`;

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

const sleep = async (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Uses Puppeteer to load the login page, submit credentials, 
 * handle Cloudflare clearance, and grab cookies.
 */
const loginAndGetBooks = async (username, password) => {
  const puppeteer = (await import('puppeteer')).default;
  console.log('Launching headless browser to bypass Cloudflare and log in...');
  const browser = await puppeteer.launch({
    headless: true, // Set to false if you want to visually see it solve any challenges
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setUserAgent(userAgent);

  try {
    // 1. Navigate to login page
    console.log('Navigating to login page...');
    await page.goto(wenku8_url + '/login.php', { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Give Cloudflare a moment to validate the browser fingerprint
    await sleep(4000);

    // 2. Fill in login form fields
    console.log('Entering credentials...');
    await page.type('input[name="username"]', username);
    await page.type('input[name="password"]', password);

    // Click submit/login button
    await Promise.all([
      page.click('input[name="submit"], button[type="submit"], input.button'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
    ]);

    console.log('Login action submitted successfully.');

    // 3. Navigate directly to the bookcase
    console.log('Fetching bookcase contents...');
    await page.goto(wenku8_books, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(2000);

    const htmlContent = await page.content();
    
    // Extract cookies to pass along to wget if needed
    const cookies = await page.cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    await browser.close();
    return { html: htmlContent, cookieHeader };

  } catch (error) {
    console.error('Error during browser automation:', error);
    await browser.close();
    throw error;
  }
}

const parse_books = (htmlData) => {
  const dom = new JSDOM(htmlData);
  const books = [];
  
  dom.window.document.querySelectorAll("[href*='/readbookcase.php']").forEach(link => {
    const params = new URLSearchParams(link.search);
    if (!params.has('cid')) {
      const bookId = parseInt(params.get('aid'));
      const path = Math.floor(bookId/1000);

      books.push({
        name: link.textContent.trim(),
        path: path,
        bookId: bookId
      });
    }
  });

  return books;
}

const download_book = async (book, cookieHeader) => {
  try {
    // Include cookies in wget if the CDN requires authorization/session cookies
    const cmd = `wget -N --no-if-modified-since --no-check-certificate --header="Cookie: ${cookieHeader}" "${wenku8_umd_url}/${book.path}/${book.bookId}/${book.bookId}.umd"`
    const { stdout, stderr } = await exec(cmd);
  }
  catch (e) {
    console.error(`Error downloading book ID ${book.bookId}:`, e);
  }

  try {
    const cmd = `cp -u "${book.bookId}.umd" "${download_path}/${book.name}.umd"`
    const { stdout, stderr } = await exec(cmd);
  }
  catch (e) {
    console.error(`Error copying book ${book.name}:`, e);
  }
}

const get_script = async () => {
  const username = process.env.WENKU8_USERNAME;
  const password = process.env.WENKU8_PASSWORD;
  
  if (!username || !password) {
    console.error('Please set WENKU8_USERNAME and WENKU8_PASSWORD environment variables.');
    return;
  }

  const { html, cookieHeader } = await loginAndGetBooks(username, password);
  const books = parse_books(html);

  fs.mkdirSync(temp_path, { recursive: true });
  process.chdir(temp_path);
  
  console.log(`Processing ${books.length} books...`);
  for (const book of books) {
    console.time('Duration');
    await download_book(book, cookieHeader);
    console.log(`Downloaded ${book.name}...`);
    console.log(`Sleeping for 30 seconds...`);
    await sleep(30000);
    console.timeEnd('Duration');
  }

  console.log(`Finished processing ${books.length} books...`);
}

get_script();