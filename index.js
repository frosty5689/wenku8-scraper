const axios = require("axios");
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');
const FormData = require('form-data');
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

axiosCookieJarSupport(axios);

const cookieJar = new tough.CookieJar();

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

const sleep = async (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const login = async (username, password) => {
  const form = new FormData();
  
  form.append('username', username);
  form.append('password', password);
  form.append('action', 'login');
  form.append('usecookie', '315360000');
  form.append('submit', '%26%23160%3B%B5%C7%26%23160%3B%26%23160%3B%C2%BC%26%23160%3B')

  const headers = {
    ...form.getHeaders(),
    'User-Agent': userAgent
  };

  const response = await axios.post(wenku8_login, form, { headers, jar: cookieJar, withCredentials: true });
  const data = response.data;

  return data;
}

const get_books = async () => {
  const headers = {
    'User-Agent': userAgent
  }
  const response = await axios.get(wenku8_books, { headers, jar: cookieJar, withCredentials: true, responseType: 'arraybuffer' });
  const dom = new JSDOM(response.data);

  const books = [];
  dom.window.document.querySelectorAll("[href*='/readbookcase.php']").forEach(link => {
    const params = new URLSearchParams(link.search);
    if (!params.has('cid')) {
      const bookId = parseInt(params.get('aid'));
      const path = Math.floor(bookId/1000);

      //const url = `/${path}/${bookId}/${bookId}.umd`;
      books.push({
        name: link.text,
        path: path,
        bookId: bookId
      });
    }
  });

  return books;
}

const download_book = async (book) => {
  try {
    const cmd = `wget -N --no-if-modified-since --no-check-certificate "${wenku8_umd_url}/${book.path}/${book.bookId}/${book.bookId}.umd"`
    //console.log(cmd)
    const { stdout, stderr } = await exec(cmd);
    //console.log(stdout);
    //console.log(stderr);
  }
  catch (e) {
    console.error(e);
  }

  try {
    const cmd = `cp -u "${book.bookId}.umd" "${download_path}/${book.name}.umd"`
    //console.log(cmd)
    const { stdout, stderr } = await exec(cmd);
    //console.log(stdout);
    //console.log(stderr);
  }
  catch (e) {
    console.error(e);
  }
}

const get_script = async () => {
  const username = process.env.WENKU8_USERNAME;
  const password = process.env.WENKU8_PASSWORD;
  console.log('Logging in...');
  const response = await login(username, password);

  const books = await get_books();
  fs.mkdirSync(temp_path, { recursive: true })
  process.chdir(temp_path);
  console.log(`Processing ${books.length} books...`);
  for (const book of books) {
    console.time('Duration');
    await download_book(book);
    console.log(`Downloaded ${book.name}...`);
    console.log(`Sleeping for 30 seconds...`);
    await sleep(30000);
    console.timeEnd('Duration');
  }

  console.log(`Finished processing ${books.length} books...`);
}

get_script();
const testSleep = async () => {
  console.log('Starting sleep test...');
  console.time('sleep');
  await sleep(2000); // Sleep for 2 seconds
  console.timeEnd('sleep');
  console.log('Sleep test complete');
}

// Uncomment this line to run the test
//testSleep();